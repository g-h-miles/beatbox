import { useEffect, useRef, useState } from "react";
import { AudioLines, ArrowLeft, Download, Play, Square } from "lucide-react";
import { drumSound } from "./audio";
import { drums, type Drum } from "./model";
import {
  patternMidi,
  patternNotes,
  stepSeconds,
  VELOCITIES,
  type BeatStep,
  type MusicalIntent,
} from "./generator";
import "./generator.css";

export default function BeatGenerator() {
  const [prompt, setPrompt] = useState("Syncopated reggae");
  const [bpm, setBpm] = useState(90);
  const [bars, setBars] = useState(8);
  const [resolution, setResolution] = useState(16);
  const [visibleBar, setVisibleBar] = useState(0);
  const steps = bars * resolution;
  const [history, setHistory] = useState<BeatStep[]>([]);
  const [intent, setIntent] = useState<MusicalIntent | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [inputTokens, setInputTokens] = useState(0);
  const [requests, setRequests] = useState(0);
  const [usageComplete, setUsageComplete] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(-1);
  const controller = useRef<AbortController | null>(null);
  const context = useRef<AudioContext | null>(null);
  const nodes = useRef<AudioScheduledSourceNode[]>([]);
  const frame = useRef(0);
  const scheduler = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );
  const playbackId = useRef(0);
  const [generationSettings, setGenerationSettings] = useState("");
  const settingsKey = JSON.stringify([prompt.trim(), bpm, bars, resolution]);
  const canContinue =
    history.length > 0 &&
    history.length < steps &&
    generationSettings === settingsKey;

  function stop() {
    playbackId.current++;
    cancelAnimationFrame(frame.current);
    clearInterval(scheduler.current);
    for (const node of nodes.current) {
      try {
        node.stop();
      } catch {
        /* already ended */
      }
    }
    nodes.current = [];
    setPlaying(false);
    setPlayhead(-1);
  }
  useEffect(
    () => () => {
      controller.current?.abort();
      playbackId.current++;
      cancelAnimationFrame(frame.current);
      clearInterval(scheduler.current);
      for (const node of nodes.current) {
        try {
          node.stop();
        } catch {
          /* already ended */
        }
      }
      void context.current?.close();
    },
    [],
  );

  async function generate(resume = false) {
    stop();
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    if (!resume) {
      setHistory([]);
      setIntent(null);
      setVisibleBar(0);
      setInputTokens(0);
      setRequests(0);
      setUsageComplete(true);
    }
    setGenerationSettings(settingsKey);
    setMessage("");
    const next: BeatStep[] = resume ? [...history] : [];
    let nextIntent = resume ? intent : null;
    const delay = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        };
        const timer = setTimeout(() => {
          current.signal.removeEventListener("abort", abort);
          resolve();
        }, ms);
        current.signal.addEventListener("abort", abort, { once: true });
        if (current.signal.aborted) abort();
      });
    let lastRequest = 0;
    let retries = 0;
    try {
      while (next.length < steps) {
        await delay(Math.max(0, 550 - (Date.now() - lastRequest)));
        lastRequest = Date.now();
        const response = await fetch("/api/generate-step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: prompt.trim(),
            bpm,
            bars,
            resolution,
            history: next,
            ...(nextIntent ? { intent: nextIntent } : {}),
          }),
          signal: current.signal,
        });
        const data = (await response.json()) as {
          error?: string;
          step?: BeatStep;
          intent?: MusicalIntent;
          modelCalls?: number;
          inputTokens?: number;
          retryable?: boolean;
        };
        if (
          (response.status === 429 ||
            ([502, 503, 504].includes(response.status) &&
              data.retryable !== false)) &&
          retries++ < 4
        ) {
          const retryHeader = response.headers.get("Retry-After");
          const seconds = Number(retryHeader);
          const dateWait = retryHeader
            ? Date.parse(retryHeader) - Date.now()
            : NaN;
          const wait =
            retryHeader && !Number.isNaN(seconds)
              ? seconds * 1000
              : Number.isFinite(dateWait)
                ? dateWait
                : response.status === 429
                  ? 60000
                  : Math.min(30000, 2000 * 2 ** (retries - 1));
          setMessage(
            "Taking a short pause. Generation will continue automatically.",
          );
          await delay(Math.max(1000, Math.min(wait, 120000)));
          continue;
        }
        retries = 0;
        setMessage("");
        if (!response.ok)
          throw new Error(
            data.error || "Could not generate this step. Try again.",
          );
        if (current.signal.aborted) return;
        if (
          !data.step ||
          !data.intent ||
          drums.some(
            (d) =>
              !(VELOCITIES as readonly number[]).includes(data.step![d.id]),
          )
        )
          throw new Error("The server returned an invalid step. Try again.");
        nextIntent = data.intent;
        setIntent(nextIntent);
        next.push(data.step);
        setHistory([...next]);
        setVisibleBar(Math.floor((next.length - 1) / resolution));
        setRequests((value) => value + (data.modelCalls === 2 ? 2 : 1));
        if (
          typeof data.inputTokens === "number" &&
          Number.isFinite(data.inputTokens)
        )
          setInputTokens((value) => value + data.inputTokens!);
        else setUsageComplete(false);
      }
    } catch (error) {
      if (!current.signal.aborted)
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not make this beat. Try again.",
        );
    } finally {
      if (controller.current === current) {
        controller.current = null;
        setBusy(false);
      }
    }
  }
  function cancel() {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setMessage(
      "Stopped. Continue when ready, or play and edit the steps made so far.",
    );
  }
  async function play() {
    if (playing) {
      stop();
      return;
    }
    const id = ++playbackId.current;
    const ctx = (context.current ??= new AudioContext());
    try {
      await ctx.resume();
      if (id !== playbackId.current) return;
      const start = ctx.currentTime + 0.05;
      const interval = stepSeconds(bpm, resolution);
      let nextStep = 0;
      const schedule = () => {
        if (id !== playbackId.current) return;
        nextStep = Math.max(
          nextStep,
          Math.ceil((ctx.currentTime - start) / interval),
        );
        while (start + nextStep * interval < ctx.currentTime + 0.12) {
          const step = history[nextStep % steps];
          if (step)
            for (const drum of drums)
              if (step[drum.id] > 0) {
                const sources = drumSound(
                  ctx,
                  drum.id,
                  start + nextStep * interval,
                  step[drum.id],
                );
                for (const source of sources)
                  source.addEventListener(
                    "ended",
                    () => {
                      nodes.current = nodes.current.filter(
                        (node) => node !== source,
                      );
                    },
                    { once: true },
                  );
                nodes.current.push(...sources);
              }
          nextStep++;
        }
      };
      schedule();
      scheduler.current = setInterval(schedule, 25);
      setPlaying(true);
      const tick = () => {
        if (id !== playbackId.current) return;
        const position = Math.floor(
          (ctx.currentTime - start) / stepSeconds(bpm, resolution),
        );
        setPlayhead(position < 0 ? -1 : position % steps);
        if (position >= 0)
          setVisibleBar(Math.floor((position % steps) / resolution));
        frame.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setMessage("Audio could not start. Press Play to try again.");
    }
  }
  function edit(index: number, drum: Drum) {
    stop();
    setHistory((previous) => {
      const next = Array.from(
        { length: Math.max(previous.length, index + 1) },
        (_, i) =>
          previous[i] ??
          (Object.fromEntries(drums.map((d) => [d.id, 0])) as BeatStep),
      );
      const old = next[index][drum];
      next[index] = {
        ...next[index],
        [drum]:
          VELOCITIES[
            ((VELOCITIES as readonly number[]).indexOf(old) + 1) %
              VELOCITIES.length
          ],
      };
      return next;
    });
  }
  function resetPattern() {
    setHistory([]);
    setIntent(null);
    setVisibleBar(0);
    setInputTokens(0);
    setRequests(0);
    setUsageComplete(true);
    setMessage("");
  }
  function download() {
    const bytes = patternMidi(history, bpm, bars, resolution);
    const url = URL.createObjectURL(
      new Blob([bytes.buffer as ArrayBuffer], { type: "audio/midi" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `beatbox-${bpm}bpm-${bars}bars-1-${resolution}.mid`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="generator-app">
      <header>
        <a className="wordmark" href="/" aria-label="Beatbox home">
          <span className="brand-icon">
            <AudioLines size={24} />
          </span>
          BEATBOX<span className="version">VOL. 01</span>
        </a>
        <a className="generator-back" href="/">
          <ArrowLeft size={15} /> Audio to MIDI
        </a>
      </header>
      <main className="generator-main">
        <section className="generator-intro">
          <p className="eyebrow">TYPESAFE ON THE DRUMS</p>
          <h1>Make a beat.</h1>
          <p>
            Describe a groove. TypeSafe chooses each hit, rest, and intensity,
            one step at a time.
          </p>
        </section>
        <form
          className="generator-form"
          onSubmit={(event) => {
            event.preventDefault();
            void generate();
          }}
        >
          <label className="generator-prompt">
            Your groove
            <input
              maxLength={500}
              required
              value={prompt}
              disabled={busy}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="A loose, syncopated reggae groove"
            />
          </label>
          <div className="generator-settings">
            <label>
              Tempo{" "}
              <span className="generator-number">
                <input
                  aria-label="Tempo in BPM"
                  type="number"
                  min={40}
                  max={240}
                  required
                  value={bpm}
                  disabled={busy}
                  onChange={(event) => {
                    stop();
                    setBpm(Number(event.target.value));
                  }}
                />
                <span>BPM</span>
              </span>
            </label>
            <label>
              Length
              <select
                aria-label="Length"
                value={bars}
                disabled={busy}
                onChange={(event) => {
                  stop();
                  setBars(Number(event.target.value));
                  resetPattern();
                }}
              >
                {[1, 2, 4, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "bar" : "bars"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Note division
              <select
                aria-label="Note division"
                value={resolution}
                disabled={busy}
                onChange={(event) => {
                  stop();
                  setResolution(Number(event.target.value));
                  resetPattern();
                }}
              >
                {[8, 16, 32, 64].map((n) => (
                  <option key={n} value={n}>
                    1/{n} notes
                  </option>
                ))}
              </select>
            </label>
            {busy ? (
              <button
                type="button"
                className="generator-cancel"
                onClick={(event) => {
                  event.preventDefault();
                  cancel();
                }}
              >
                <Square size={14} /> Stop generating
              </button>
            ) : (
              <button
                type="submit"
                className="generator-primary"
                disabled={!prompt.trim() || bpm < 40 || bpm > 240}
              >
                {history.length ? "Make another beat" : "Make beat"}
                <AudioLines size={17} />
              </button>
            )}
          </div>
          {!busy && canContinue && (
            <button
              className="generator-resume"
              type="button"
              onClick={() => void generate(true)}
            >
              Continue from bar {Math.floor(history.length / resolution) + 1},
              step {(history.length % resolution) + 1}
            </button>
          )}
        </form>
        <section className="generator-pattern" aria-label="Beat pattern">
          <div className="generator-toolbar">
            <div>
              <h2>Your pattern</h2>
              <p>
                {busy
                  ? `Bar ${Math.floor(Math.min(history.length, steps - 1) / resolution) + 1} of ${bars} · ${history.length} / ${steps} positions`
                  : `${bars} ${bars === 1 ? "bar" : "bars"} in 4/4 · 1/${resolution} notes · ${((bars * 240) / bpm).toFixed(1)} seconds. Tap a cell to change its intensity.`}
              </p>
            </div>
            <div className="generator-actions">
              <button
                onClick={() => void play()}
                disabled={busy || !history.length || bpm < 40 || bpm > 240}
              >
                {playing ? <Square size={15} /> : <Play size={15} />}
                {playing ? "Stop" : "Play loop"}
              </button>
              <button
                onClick={download}
                disabled={busy || !history.length || bpm < 40 || bpm > 240}
              >
                <Download size={15} /> MIDI
              </button>
            </div>
          </div>
          {intent && (
            <p
              className="generator-direction"
              aria-label="TypeSafe musical direction"
            >
              TypeSafe chose:{" "}
              {[
                intent.foundation.replaceAll("_", " "),
                intent.timekeeping.replaceAll("_", " "),
                intent.voice === "closed"
                  ? "closed hats"
                  : intent.voice === "open"
                    ? "open hats"
                    : intent.voice === "mixed"
                      ? "mixed cymbals"
                      : "ride",
                {
                  steady: "steady groove",
                  subtle: "subtle variation",
                  fills: "phrase-end fills",
                  evolving: "evolving phrase",
                }[intent.variation],
              ].join(" · ")}
            </p>
          )}
          <nav className="generator-bars" aria-label="Pattern bars">
            {Array.from({ length: bars }, (_, index) => (
              <button
                key={index}
                type="button"
                aria-current={visibleBar === index ? "page" : undefined}
                onClick={() => setVisibleBar(index)}
              >
                Bar {index + 1}
              </button>
            ))}
          </nav>
          <div
            className="generator-grid-scroll"
            tabIndex={0}
            role="region"
            aria-label="Scrollable drum sequencer"
          >
            <div
              className="generator-grid"
              style={{
                gridTemplateColumns: `100px repeat(${resolution}, minmax(30px, 1fr))`,
              }}
            >
              <span className="generator-row-label generator-corner">
                SOUND / BEAT
              </span>
              {Array.from({ length: resolution }, (_, i) => (
                <span
                  key={`n${i}`}
                  className={`generator-step-number ${playhead === visibleBar * resolution + i ? "current" : ""}`}
                >
                  {i % (resolution / 4) === 0 ? i / (resolution / 4) + 1 : "·"}
                </span>
              ))}
              {drums.map((drum) => (
                <div className="generator-grid-row" key={drum.id}>
                  <span className="generator-row-label">{drum.name}</span>
                  {Array.from({ length: resolution }, (_, i) => {
                    const index = visibleBar * resolution + i;
                    const velocity = history[index]?.[drum.id] ?? 0;
                    return (
                      <button
                        type="button"
                        key={i}
                        className={`generator-cell ${velocity ? "on" : ""} ${i % (resolution / 4) === 0 ? "beat-start" : ""} ${playhead === visibleBar * resolution + i ? "current" : ""} ${index >= history.length ? "unmade" : ""}`}
                        style={
                          {
                            "--strength": velocity / 127,
                          } as React.CSSProperties
                        }
                        disabled={busy}
                        onClick={() => edit(index, drum.id)}
                        aria-label={`${drum.name}, bar ${visibleBar + 1}, step ${i + 1}: ${velocity ? `velocity ${velocity}` : "rest"}. Change intensity.`}
                        aria-pressed={velocity > 0}
                        title={`${drum.name} · bar ${visibleBar + 1} · step ${i + 1} · ${velocity || "rest"}`}
                      >
                        {velocity > 0 && <span />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="generator-foot">
            <span>Rest → ghost → soft → medium → strong → accent</span>
            <span>
              {requests} completed model calls
              {inputTokens > 0
                ? ` · ${inputTokens.toLocaleString()} ${usageComplete ? "reported input tokens" : "reported input tokens (partial)"}`
                : ""}
            </span>
          </div>
          {busy && (
            <progress
              className="generator-progress"
              max={steps}
              value={history.length}
              aria-label="Generation progress"
            />
          )}
          <p className="generator-message" role="status" aria-live="polite">
            {message ||
              (busy
                ? "Each decision includes all the steps before it."
                : history.length === steps
                  ? patternNotes(history, bpm, resolution).length
                    ? "Ready to play, tweak, or take into your DAW."
                    : "TypeSafe chose silence. Try a more specific groove, or add hits in the grid."
                  : "")}
          </p>
        </section>
      </main>
    </div>
  );
}
