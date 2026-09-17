import { useEffect, useRef, useState } from "react";
import { AudioLines, ArrowLeft, Download, Play, Square } from "lucide-react";
import { drumSound } from "./audio";
import { drums, type Drum } from "./model";
import {
  patternMidi,
  pendingBatches,
  patternNotes,
  stepSeconds,
  VELOCITIES,
  type BeatStep,
  type MusicalIntent,
} from "./generator";
import "./generator.css";
import { LiveDrummer, emptyStep } from "./live-drummer";

export default function BeatGenerator() {
  const [live, setLive] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [clickEnabled, setClickEnabled] = useState(true);
  const clickRef = useRef(true);
  const liveEngine = useRef<LiveDrummer | null>(null);
  const [prompt, setPrompt] = useState("Syncopated reggae");
  const [bpm, setBpm] = useState(90);
  const [bars, setBars] = useState(4);
  const [resolution, setResolution] = useState(16);
  const [visibleBar, setVisibleBar] = useState(0);
  const [visibleBeat, setVisibleBeat] = useState(0);
  const [compact, setCompact] = useState(() => window.innerWidth < 700);
  useEffect(() => {
    const media = matchMedia("(max-width: 699px)");
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const columns = compact ? resolution / 4 : resolution;
  const firstColumn = compact ? visibleBeat * columns : 0;
  const steps = bars * resolution;
  const [history, setHistory] = useState<BeatStep[]>([]);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
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
    intent !== null &&
    completed.size < steps &&
    generationSettings === settingsKey;

  useEffect(() => {
    if (!live) return;
    const timer = setTimeout(() => liveEngine.current?.setPrompt(prompt), 400);
    return () => clearTimeout(timer);
  }, [prompt, live]);

  function stop() {
    liveEngine.current?.stop();
    liveEngine.current = null;
    setLive(false);
    setCountdown(0);
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
      liveEngine.current?.stop();
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

  async function startDrummer() {
    if (live) {
      stop();
      setMessage("Drummer stopped. Keep this pattern, or start again.");
      return;
    }
    stop();
    resetPattern();
    const id = playbackId.current;
    const ctx = (context.current ??= new AudioContext());
    try {
      await ctx.resume();
      if (id !== playbackId.current) return;
      const keep = (source: AudioScheduledSourceNode) => {
        nodes.current.push(source);
        source.addEventListener(
          "ended",
          () => {
            nodes.current = nodes.current.filter((n) => n !== source);
          },
          { once: true },
        );
      };
      const engine = new LiveDrummer(
        { prompt: prompt.trim(), bpm, bars, resolution },
        {
          now: () => ctx.currentTime,
          click: (time, accent) => {
            if (!clickRef.current) return;
            const oscillator = ctx.createOscillator(),
              gain = ctx.createGain();
            oscillator.frequency.value = accent ? 1400 : 1000;
            gain.gain.setValueAtTime(0.12, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.035);
            oscillator.connect(gain);
            gain.connect(ctx.destination);
            oscillator.start(time);
            oscillator.stop(time + 0.04);
            keep(oscillator);
          },
          hit: (time, step) => {
            for (const drum of drums)
              if (step[drum.id] > 0)
                drumSound(ctx, drum.id, time, step[drum.id]).forEach(keep);
          },
          position: (absolute, count) => {
            setCountdown(count);
            const position = absolute < 0 ? -1 : absolute % steps;
            setPlayhead(position);
            if (position >= 0) {
              setVisibleBar(Math.floor(position / resolution));
              setVisibleBeat(
                Math.floor((position % resolution) / (resolution / 4)),
              );
            }
          },
          decisions: (start, part) => {
            setHistory((previous) => {
              const next = Array.from(
                { length: steps },
                (_, i) => previous[i] ?? emptyStep(),
              );
              part.forEach((step, i) => {
                next[(start + i) % steps] = step;
              });
              return next;
            });
            setCompleted((previous) => {
              const next = new Set(previous);
              part.forEach((_, i) => next.add((start + i) % steps));
              return next;
            });
          },
          direction: setIntent,
          usage: (calls, tokens) => {
            setRequests((value) => value + calls);
            if (tokens === null) setUsageComplete(false);
            else setInputTokens((value) => value + tokens);
          },
          status: setMessage,
        },
      );
      liveEngine.current = engine;
      setLive(true);
      engine.start();
    } catch {
      setMessage("Audio could not start. Try starting the drummer again.");
    }
  }
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
    const empty = () =>
      Object.fromEntries(drums.map((d) => [d.id, 0])) as BeatStep;
    const next = Array.from({ length: steps }, (_, i) =>
      resume ? (history[i] ?? empty()) : empty(),
    );
    const done = resume ? new Set(completed) : new Set<number>();
    if (!resume) setCompleted(new Set());
    let nextIntent = resume ? intent : null;
    const call = async (extra: Record<string, unknown>) => {
      for (let retry = 0; ; retry++) {
        current.signal.throwIfAborted();
        const response = await fetch("/api/generate-step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: prompt.trim(),
            bpm,
            bars,
            resolution,
            history: [],
            ...extra,
          }),
          signal: current.signal,
        });
        const data = (await response.json()) as {
          error?: string;
          retryable?: boolean;
          intent?: MusicalIntent;
          start?: number;
          steps?: BeatStep[];
          inputTokens?: number;
          modelCalls?: number;
        };
        if (!response.ok) {
          if (
            [429, 502, 503, 504].includes(response.status) &&
            data.retryable !== false &&
            retry < 2
          ) {
            setMessage("TypeSafe is busy. Retrying the unfinished part…");
            await new Promise<void>((resolve, reject) => {
              const abort = () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
              };
              const timer = setTimeout(
                () => {
                  current.signal.removeEventListener("abort", abort);
                  resolve();
                },
                response.status === 429 ? 60000 : 2000 * 2 ** retry,
              );
              current.signal.addEventListener("abort", abort, { once: true });
              if (current.signal.aborted) abort();
            });
            continue;
          }
          throw Error(
            data.error ||
              "Could not finish this beat. Continue to retry the missing parts.",
          );
        }
        current.signal.throwIfAborted();
        setRequests((value) => value + (data.modelCalls ?? 1));
        if (
          typeof data.inputTokens === "number" &&
          Number.isFinite(data.inputTokens)
        )
          setInputTokens((value) => value + data.inputTokens!);
        else setUsageComplete(false);
        return data;
      }
    };
    try {
      if (!nextIntent) {
        const data = await call({ planOnly: true });
        if (!data.intent)
          throw Error("The server returned an invalid musical direction.");
        nextIntent = data.intent;
        setIntent(nextIntent);
      }
      const jobs = pendingBatches(steps, done);
      const results = await Promise.allSettled(
        jobs.map(async ({ start, size }) => {
          const data = await call({
            intent: nextIntent,
            batchStart: start,
            batchSize: size,
          });
          if (
            data.start !== start ||
            data.steps?.length !== size ||
            data.steps.some(
              (step) =>
                !step ||
                drums.some(
                  (d) =>
                    !(VELOCITIES as readonly number[]).includes(step[d.id]),
                ),
            )
          )
            throw Error(
              "The server returned an invalid part. Continue to retry it.",
            );
          current.signal.throwIfAborted();
          data.steps.forEach((step, i) => {
            if (!done.has(start + i)) next[start + i] = step;
            done.add(start + i);
          });
          setHistory([...next]);
          setCompleted(new Set(done));
        }),
      );
      current.signal.throwIfAborted();
      const failed = results.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
      setMessage("");
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
        if (position >= 0) {
          setVisibleBar(Math.floor((position % steps) / resolution));
          setVisibleBeat(
            Math.floor((position % resolution) / (resolution / 4)),
          );
        }
        frame.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setMessage("Audio could not start. Press Play to try again.");
    }
  }
  function edit(index: number, drum: Drum) {
    stop();
    setCompleted((previous) => new Set(previous).add(index));
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
    setCompleted(new Set());
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
          <h1>Your live drummer.</h1>
          <p>
            Start the click. TypeSafe plays along, choosing new hits as you go.
            Change the groove while it plays.
          </p>
        </section>
        <form
          className="generator-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (live) {
              liveEngine.current?.setPrompt(prompt);
              setMessage("New direction queued for the upcoming beats.");
            } else void startDrummer();
          }}
        >
          <label className="generator-prompt">
            Your groove
            <input
              maxLength={500}
              required
              value={prompt}
              disabled={busy}
              onChange={(event) => {
                setPrompt(event.target.value);
              }}
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
                  disabled={busy || live}
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
                disabled={busy || live}
                onChange={(event) => {
                  stop();
                  setBars(Number(event.target.value));
                  resetPattern();
                }}
              >
                {[1, 2, 4].map((n) => (
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
                disabled={busy || live}
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
                type={live ? "button" : "submit"}
                onClick={
                  live
                    ? (event) => {
                        event.preventDefault();
                        void startDrummer();
                      }
                    : undefined
                }
                className="generator-primary"
                disabled={!live && (!prompt.trim() || bpm < 40 || bpm > 240)}
              >
                {live ? "Stop drummer" : "Start drummer"}
                <AudioLines size={17} />
              </button>
            )}
          </div>
          <div className="generator-live-controls">
            <label className="generator-click-toggle">
              <input
                type="checkbox"
                checked={clickEnabled}
                onChange={(event) => {
                  setClickEnabled(event.target.checked);
                  clickRef.current = event.target.checked;
                }}
              />{" "}
              Click track
            </label>
            {!live && (
              <button
                type="button"
                disabled={busy || !prompt.trim() || bpm < 40 || bpm > 240}
                onClick={() => void generate()}
              >
                Generate a fixed pattern
              </button>
            )}
            {live && (
              <span role="status">
                {countdown
                  ? `Count in · ${countdown}`
                  : "LIVE · Change the groove as it plays"}
              </span>
            )}
          </div>
          {!busy && !live && canContinue && (
            <button
              className="generator-resume"
              type="button"
              onClick={() => void generate(true)}
            >
              Continue unfinished parts
            </button>
          )}
        </form>
        <section className="generator-pattern" aria-label="Beat pattern">
          <div className="generator-toolbar">
            <div>
              <h2>{live ? "On the drums" : "Your pattern"}</h2>
              <p>
                {live
                  ? `${bars}-bar rolling view · 1/${resolution} notes · new decisions every beat`
                  : busy
                    ? `${completed.size} / ${steps} positions · ${intent ? "Building your groove" : "Finding the feel"}`
                    : `${bars} ${bars === 1 ? "bar" : "bars"} in 4/4 · 1/${resolution} notes · ${((bars * 240) / bpm).toFixed(1)} seconds. Tap a cell to change its intensity.`}
              </p>
            </div>
            <div className="generator-actions">
              <button
                onClick={() => void play()}
                disabled={
                  busy || live || !history.length || bpm < 40 || bpm > 240
                }
              >
                {playing ? <Square size={15} /> : <Play size={15} />}
                {playing ? "Stop" : "Play loop"}
              </button>
              <button
                onClick={download}
                disabled={
                  busy || live || !history.length || bpm < 40 || bpm > 240
                }
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
          {compact && (
            <nav className="generator-bars" aria-label="Beats within bar">
              {[0, 1, 2, 3].map((beat) => (
                <button
                  key={beat}
                  type="button"
                  aria-current={visibleBeat === beat ? "page" : undefined}
                  onClick={() => setVisibleBeat(beat)}
                >
                  Beat {beat + 1}
                </button>
              ))}
            </nav>
          )}
          <div
            className="generator-grid-scroll"
            role="region"
            aria-label="Drum sequencer"
          >
            <div
              className="generator-grid"
              style={{
                gridTemplateColumns: `80px repeat(${columns}, minmax(0, 1fr))`,
              }}
            >
              <span className="generator-row-label generator-corner">
                SOUND / BEAT
              </span>
              {Array.from({ length: columns }, (_, offset) => {
                const i = firstColumn + offset;
                return (
                  <span
                    key={`n${i}`}
                    className={`generator-step-number ${playhead === visibleBar * resolution + i ? "current" : ""}`}
                  >
                    {i % (resolution / 4) === 0
                      ? i / (resolution / 4) + 1
                      : "·"}
                  </span>
                );
              })}
              {drums.map((drum) => (
                <div className="generator-grid-row" key={drum.id}>
                  <span className="generator-row-label">{drum.name}</span>
                  {Array.from({ length: columns }, (_, offset) => {
                    const i = firstColumn + offset;
                    const index = visibleBar * resolution + i;
                    const velocity = history[index]?.[drum.id] ?? 0;
                    return (
                      <button
                        type="button"
                        key={i}
                        className={`generator-cell ${velocity ? "on" : ""} ${i % (resolution / 4) === 0 ? "beat-start" : ""} ${playhead === visibleBar * resolution + i ? "current" : ""} ${!completed.has(index) ? "unmade" : ""}`}
                        style={
                          {
                            "--strength": velocity / 127,
                          } as React.CSSProperties
                        }
                        disabled={busy || live}
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
              value={completed.size}
              aria-label="Generation progress"
            />
          )}
          <p className="generator-message" role="status" aria-live="polite">
            {message ||
              (busy
                ? "The groove fills in as its parts arrive."
                : completed.size === steps
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
