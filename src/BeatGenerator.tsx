import { useEffect, useRef, useState } from "react";
import { AudioLines, ArrowLeft, Download, Play, Square } from "lucide-react";
import { drumSound } from "./audio";
import { drums, type Drum } from "./model";
import { midi } from "./midi";
import {
  patternNotes,
  stepSeconds,
  VELOCITIES,
  type BeatStep,
} from "./generator";
import "./generator.css";

export default function BeatGenerator() {
  const [prompt, setPrompt] = useState("Syncopated reggae");
  const [bpm, setBpm] = useState(90);
  const [steps, setSteps] = useState(16);
  const [history, setHistory] = useState<BeatStep[]>([]);
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
  const settingsKey = JSON.stringify([prompt.trim(), bpm, steps]);
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
      setInputTokens(0);
      setRequests(0);
      setUsageComplete(true);
    }
    setGenerationSettings(settingsKey);
    setMessage("");
    const next: BeatStep[] = resume ? [...history] : [];
    try {
      while (next.length < steps) {
        const response = await fetch("/api/generate-step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: prompt.trim(),
            bpm,
            steps,
            history: next,
          }),
          signal: current.signal,
        });
        const data = (await response.json()) as {
          error?: string;
          step?: BeatStep;
          inputTokens?: number;
        };
        if (!response.ok)
          throw new Error(
            data.error || "Could not generate this step. Try again.",
          );
        if (current.signal.aborted) return;
        if (
          !data.step ||
          drums.some(
            (d) =>
              !(VELOCITIES as readonly number[]).includes(data.step![d.id]),
          )
        )
          throw new Error("The server returned an invalid step. Try again.");
        next.push(data.step);
        setHistory([...next]);
        setRequests((value) => value + 1);
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
      const interval = stepSeconds(bpm);
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
          (ctx.currentTime - start) / stepSeconds(bpm),
        );
        setPlayhead(position < 0 ? -1 : position % steps);
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
  function download() {
    const bytes = midi(
      patternNotes(history, bpm),
      bpm,
      steps * stepSeconds(bpm),
      "BEATBOX • TypeSafe beat",
    );
    const url = URL.createObjectURL(
      new Blob([bytes.buffer as ArrayBuffer], { type: "audio/midi" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `beatbox-${bpm}bpm-${steps}steps.mid`;
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
                value={steps}
                disabled={busy}
                onChange={(event) => {
                  stop();
                  setSteps(Number(event.target.value));
                  setHistory([]);
                  setInputTokens(0);
                  setRequests(0);
                  setUsageComplete(true);
                  setMessage("");
                }}
              >
                {[8, 16, 32, 64].map((n) => (
                  <option key={n} value={n}>
                    {n} steps · {n / 16} {n === 16 ? "bar" : "bars"}
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
              Continue from step {history.length + 1}
            </button>
          )}
        </form>
        <section className="generator-pattern" aria-label="Beat pattern">
          <div className="generator-toolbar">
            <div>
              <h2>Your pattern</h2>
              <p>
                {busy
                  ? `Choosing step ${history.length + 1} of ${steps}…`
                  : "16 steps = one bar. Tap a cell to change its intensity."}
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
          <div
            className="generator-grid-scroll"
            tabIndex={0}
            role="region"
            aria-label="Scrollable drum sequencer"
          >
            <div
              className="generator-grid"
              style={{
                gridTemplateColumns: `100px repeat(${steps}, minmax(30px, 1fr))`,
              }}
            >
              <span className="generator-row-label generator-corner">
                SOUND / STEP
              </span>
              {Array.from({ length: steps }, (_, i) => (
                <span
                  key={`n${i}`}
                  className={`generator-step-number ${playhead === i ? "current" : ""}`}
                >
                  {i + 1}
                </span>
              ))}
              {drums.map((drum) => (
                <div className="generator-grid-row" key={drum.id}>
                  <span className="generator-row-label">{drum.name}</span>
                  {Array.from({ length: steps }, (_, i) => {
                    const velocity = history[i]?.[drum.id] ?? 0;
                    return (
                      <button
                        type="button"
                        key={i}
                        className={`generator-cell ${velocity ? "on" : ""} ${i % 4 === 0 ? "beat-start" : ""} ${playhead === i ? "current" : ""} ${i >= history.length ? "unmade" : ""}`}
                        style={
                          {
                            "--strength": velocity / 127,
                          } as React.CSSProperties
                        }
                        disabled={busy}
                        onClick={() => edit(i, drum.id)}
                        aria-label={`${drum.name}, step ${i + 1}: ${velocity ? `velocity ${velocity}` : "rest"}. Change intensity.`}
                        aria-pressed={velocity > 0}
                        title={`${drum.name} · step ${i + 1} · ${velocity || "rest"}`}
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
              {requests} completed requests
              {inputTokens > 0
                ? ` · ${inputTokens.toLocaleString()} ${usageComplete ? "input tokens" : "reported input tokens"}`
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
                  ? patternNotes(history, bpm).length
                    ? "Ready to play, tweak, or take into your DAW."
                    : "TypeSafe chose silence. Try a more specific groove, or add hits in the grid."
                  : "")}
          </p>
        </section>
      </main>
    </div>
  );
}
