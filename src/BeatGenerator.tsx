import { drumKits, type DrumKit } from "./drum-kits";
import { useEffect, useRef, useState } from "react";
import { AudioLines, ArrowLeft, Download, Play, Square } from "lucide-react";
import { grooveSound } from "./groove-audio";
import { drums, type Drum } from "./model";
import { VELOCITIES } from "./generator";
import {
  barMidi,
  foundations,
  tops,
  feels,
  type BarGroove,
} from "./bar-groove";
import { BarPlayer } from "./bar-player";
import "./generator.css";

export default function BeatGenerator() {
  const [prompt, setPrompt] = useState(
    "A laid-back pocket. Firm kick, snare on 2 and 4, quiet eighth-note hats.",
  );
  const [amendment, setAmendment] = useState("");
  const [undoGroove, setUndoGroove] = useState<BarGroove | null>(null);
  const [kitChoice, setKitChoice] = useState<DrumKit | "auto">("auto");
  const [resolution, setResolution] = useState(16);
  const [bar, setBar] = useState(0);
  const [bpm, setBpm] = useState(90);
  const [groove, setGroove] = useState<BarGroove | null>(null);
  const [busy, setBusy] = useState(false),
    [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState(""),
    [playhead, setPlayhead] = useState(-1);
  const [click, setClick] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [calls, setCalls] = useState(0);
  const [beat, setBeat] = useState(0),
    [compact, setCompact] = useState(window.innerWidth < 700);
  const ctx = useRef<AudioContext | null>(null),
    player = useRef<BarPlayer | null>(null);
  const sources = useRef<AudioScheduledSourceNode[]>([]),
    clickSources = useRef<AudioScheduledSourceNode[]>([]);
  const clickRef = useRef(false),
    controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const media = matchMedia("(max-width: 699px)");
    const change = () => setCompact(media.matches);
    media.addEventListener("change", change);
    return () => {
      mounted.current = false;
      media.removeEventListener("change", change);
      controller.current?.abort();
      player.current?.stop();
      sources.current.forEach((n) => {
        try {
          n.stop();
        } catch {}
      });
      void ctx.current?.close();
    };
  }, []);
  function stop() {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    player.current?.stop();
    player.current = null;
    sources.current.forEach((n) => {
      try {
        n.stop();
      } catch {}
    });
    sources.current = [];
    clickSources.current = [];
    setPlaying(false);
    setPlayhead(-1);
    setMessage("Stopped. Your phrase is ready to edit or export.");
  }
  const keep = (node: AudioScheduledSourceNode) => {
    sources.current.push(node);
    node.addEventListener(
      "ended",
      () => {
        sources.current = sources.current.filter((n) => n !== node);
        clickSources.current = clickSources.current.filter((n) => n !== node);
      },
      { once: true },
    );
  };
  function start(value: BarGroove) {
    if (!ctx.current) return;
    const audio = ctx.current;
    let activeGroove = value;
    player.current?.stop();
    const transport = new BarPlayer(value, bpm, {
      now: () => audio.currentTime,
      hit: (note, time) =>
        grooveSound(
          audio,
          note.drum,
          time,
          note.velocity,
          kitChoice === "auto" ? (activeGroove.kit ?? "electronic") : kitChoice,
        ).forEach(keep),
      click: (time, accent) => {
        if (!clickRef.current) return;
        const osc = audio.createOscillator(),
          gain = audio.createGain();
        osc.frequency.value = accent ? 1400 : 1000;
        gain.gain.setValueAtTime(0.08, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
        osc.connect(gain);
        gain.connect(audio.destination);
        osc.start(time);
        osc.stop(time + 0.035);
        keep(osc);
        clickSources.current.push(osc);
      },
      bar: (value) => {
        activeGroove = value;
        setGroove(value);
        setMessage(
          "Looping four bars. Make a new groove to change it at the next bar.",
        );
      },
      position: (i) => {
        setPlayhead(i);
        if (i >= 0) {
          setBar(Math.floor(i / (value.resolution ?? 16)));
          setBeat(
            Math.floor(
              (i % (value.resolution ?? 16)) / ((value.resolution ?? 16) / 4),
            ),
          );
        }
      },
    });
    player.current = transport;
    setPlaying(true);
    transport.start();
  }
  async function make(amend = false) {
    if (
      busy ||
      (amend && (!groove || !amendment.trim())) ||
      !prompt.trim() ||
      !Number.isInteger(bpm) ||
      bpm < 40 ||
      bpm > 240
    )
      return;
    const abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    setBusy(true);
    setMessage(amend ? "Applying your edit…" : "Arranging your groove…");
    setElapsed(null);
    const started = performance.now();
    try {
      const audio = (ctx.current ??= new AudioContext());
      await audio.resume();
      const response = await fetch("/api/generate-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: amend ? amendment.trim() : prompt.trim(),
          ...(amend ? { amend: groove } : {}),
          bpm,
          bars: 4,
          resolution,
          history: [],
          oneBar: true,
        }),
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(60000)]),
      });
      const data = (await response.json()) as {
        error?: string;
        modelCalls?: number;
        unsupported?: boolean;
        message?: string;
        groove?: BarGroove;
        edits?: { step: number; drum: string; before: number; after: number }[];
      };
      abort.signal.throwIfAborted();
      if (!response.ok)
        throw Error(
          data.error || "The groove could not be arranged. Try again.",
        );
      setCalls(data.modelCalls ?? 0);
      setElapsed((performance.now() - started) / 1000);
      if (data.unsupported) {
        setMessage(
          data.message || "That request is outside the available drum phrases.",
        );
        return;
      }
      const next = data.groove as BarGroove;
      if (
        !next ||
        !Object.hasOwn(foundations, next.foundation) ||
        !Object.hasOwn(tops, next.top) ||
        !Object.hasOwn(feels, next.feel) ||
        !Array.isArray(next.steps) ||
        next.steps.length !== 4 * resolution ||
        next.steps.some(
          (s) =>
            !s ||
            drums.some(
              (d) => !(VELOCITIES as readonly number[]).includes(s[d.id]),
            ),
        )
      )
        throw Error("The model returned an invalid arrangement.");
      setUndoGroove(amend ? groove : null);
      if (amend) {
        stop();
        setGroove(next);
        setMessage(
          `${data.edits?.length ?? 0} ${(data.edits?.length ?? 0) === 1 ? "cell" : "cells"} changed. Everything else preserved. Press Play to listen.`,
        );
        setAmendment("");
      } else if (player.current) {
        player.current.queue(next);
        setMessage("New groove ready. Switching at the next bar.");
      } else {
        setGroove(next);
        start(next);
      }
    } catch (error) {
      if (!abort.signal.aborted && mounted.current)
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not arrange the groove.",
        );
    } finally {
      if (controller.current === abort) {
        setBusy(false);
        controller.current = null;
      }
    }
  }
  async function play() {
    if (playing) {
      stop();
      return;
    }
    if (!groove) return;
    const abort = new AbortController();
    controller.current = abort;
    try {
      await (ctx.current ??= new AudioContext()).resume();
      if (!abort.signal.aborted && mounted.current) start(groove);
    } catch {
      setMessage("Audio could not start. Try Play again.");
    } finally {
      if (controller.current === abort) controller.current = null;
    }
  }
  function edit(index: number, drum: Drum) {
    if (!groove) return;
    stop();
    setUndoGroove(null);
    const steps = groove.steps.map((s) => ({ ...s }));
    const old = steps[index][drum];
    steps[index][drum] =
      VELOCITIES[
        ((VELOCITIES as readonly number[]).indexOf(old) + 1) % VELOCITIES.length
      ];
    if (
      drums.find((d) => d.id === drum) &&
      ["closed", "open", "ride"].includes(drum) &&
      steps[index][drum]
    )
      for (const other of ["closed", "open", "ride"] as const)
        if (other !== drum) steps[index][other] = 0;
    setGroove({ ...groove, steps });
    setMessage("Edited. Press Play to hear your phrase.");
  }
  function download() {
    if (!groove) return;
    const bytes = barMidi(groove, bpm),
      url = URL.createObjectURL(
        new Blob([bytes.buffer as ArrayBuffer], { type: "audio/midi" }),
      );
    const link = document.createElement("a");
    link.href = url;
    link.download = `beatbox-${bpm}bpm-four-bars.mid`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const currentPlan = groove?.arrangements?.[bar] ?? groove;
  const validBpm = Number.isInteger(bpm) && bpm >= 40 && bpm <= 240;
  const shown = [...drums]
    .sort(
      (a, b) =>
        ["kick", "snare", "closed", "open", "ride", "crash", "aux"].indexOf(
          a.id,
        ) -
        ["kick", "snare", "closed", "open", "ride", "crash", "aux"].indexOf(
          b.id,
        ),
    )
    .filter(
      (d) =>
        ["kick", "snare", "closed", "open"].includes(d.id) ||
        groove?.steps.some((s) => s[d.id] > 0),
    );
  const gridResolution = groove?.resolution ?? resolution;
  const perBeat = gridResolution / 4;
  const offset = bar * gridResolution + (compact ? beat * perBeat : 0),
    columns = compact ? perBeat : gridResolution;
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
          <ArrowLeft size={15} />
          Audio to MIDI
        </a>
      </header>
      <main className="generator-main">
        <section className="generator-intro">
          <p className="eyebrow">FOUR BARS. FIND THE POCKET.</p>
          <h1>A groove worth repeating.</h1>
          <p>
            Describe the feel. TypeSafe combines written drum phrases from a
            small groove library, arranging each bar in context. Ask for a fill
            on a specific bar.
          </p>
        </section>
        <form
          className="generator-form"
          onSubmit={(e) => {
            e.preventDefault();
            void make();
          }}
        >
          <label className="generator-prompt">
            Your groove
            <input
              value={prompt}
              maxLength={500}
              required
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A laid-back pocket with quiet hats"
            />
          </label>
          <div className="generator-settings">
            <label>
              Tempo
              <span className="generator-number">
                <input
                  aria-label="Tempo in BPM"
                  type="number"
                  min={40}
                  max={240}
                  step={1}
                  required
                  value={bpm}
                  disabled={busy || playing}
                  onChange={(e) => setBpm(Number(e.target.value))}
                />
                <span>BPM</span>
              </span>
            </label>
            <label>
              Grid
              <select
                aria-label="Note subdivision"
                value={resolution}
                disabled={busy || playing}
                onChange={(e) => {
                  setResolution(Number(e.target.value));
                  setGroove(null);
                  setBar(0);
                  setBeat(0);
                }}
              >
                <option value={16}>1/16</option>
                <option value={32}>1/32</option>
              </select>
            </label>
            <label>
              Kit
              <select
                aria-label="Drum kit"
                value={kitChoice}
                disabled={busy}
                onChange={(e) => {
                  stop();
                  setKitChoice(e.target.value as DrumKit | "auto");
                }}
              >
                <option value="auto">TypeSafe chooses</option>
                {Object.entries(drumKits).map(([id, kit]) => (
                  <option key={id} value={id}>
                    {kit.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="generator-direction">4 bars · 4/4</span>
            <button
              type="submit"
              className="generator-primary"
              disabled={
                busy ||
                !prompt.trim() ||
                !Number.isInteger(bpm) ||
                bpm < 40 ||
                bpm > 240
              }
            >
              {busy
                ? "Arranging…"
                : playing
                  ? "Make new groove"
                  : "Make & play"}
              <AudioLines size={17} />
            </button>
          </div>
          <div className="generator-live-controls">
            <label className="generator-click-toggle">
              <input
                type="checkbox"
                checked={click}
                onChange={(e) => {
                  setClick(e.target.checked);
                  clickRef.current = e.target.checked;
                  if (!e.target.checked) {
                    clickSources.current.forEach((n) => {
                      try {
                        n.stop();
                      } catch {}
                    });
                    clickSources.current = [];
                  }
                }}
              />
              Click track
            </label>
            <span>
              Changes land at the next bar. Fills where you ask for them.
            </span>
            {busy && (
              <button type="button" onClick={stop}>
                Cancel
              </button>
            )}
          </div>
        </form>
        {groove && (
          <form
            className="generator-form"
            onSubmit={(e) => {
              e.preventDefault();
              void make(true);
            }}
          >
            <label className="generator-prompt">
              Amend your beat
              <input
                aria-label="Amend your beat"
                value={amendment}
                maxLength={500}
                required
                disabled={busy}
                onChange={(e) => setAmendment(e.target.value)}
                placeholder="Add a closed hat on bar 3, beat 2&"
              />
            </label>
            <div className="generator-settings">
              <button type="submit" disabled={busy || !amendment.trim()}>
                Apply edit
              </button>
              <button
                type="button"
                disabled={busy || !undoGroove}
                onClick={() => {
                  if (undoGroove) {
                    stop();
                    setGroove(undoGroove);
                    setUndoGroove(null);
                    setMessage("Edit undone.");
                  }
                }}
              >
                Undo edit
              </button>
            </div>
          </form>
        )}
        <section className="generator-pattern" aria-label="Beat pattern">
          <div className="generator-toolbar">
            <div>
              <h2>Your phrase</h2>
              <p>
                {validBpm ? (960 / bpm).toFixed(2) : "—"} seconds · Tap a cell
                to change its intensity.
              </p>
            </div>
            <div className="generator-actions">
              <button
                type="button"
                onClick={() => void play()}
                disabled={!groove || (!playing && busy) || !validBpm}
              >
                {playing ? <Square size={15} /> : <Play size={15} />}{" "}
                {playing ? "Stop" : "Play loop"}
              </button>
              <button
                type="button"
                onClick={download}
                disabled={!groove || !validBpm}
              >
                <Download size={15} />
                MIDI
              </button>
            </div>
          </div>
          {groove && (
            <p className="generator-direction">
              {foundations[currentPlan!.foundation].name} ·{" "}
              {tops[currentPlan!.top].name} ·{" "}
              {currentPlan!.feel.replaceAll("_", " ")} ·{" "}
              {
                drumKits[
                  kitChoice === "auto"
                    ? (groove.kit ?? "electronic")
                    : kitChoice
                ].name
              }
              {groove.arrangements?.[bar]?.fill !== "none" &&
              groove.arrangements?.[bar]?.fill
                ? " · Fill"
                : ""}
            </p>
          )}
          <nav className="generator-bars" aria-label="Bars">
            {[0, 1, 2, 3].map((i) => (
              <button
                key={i}
                type="button"
                aria-current={bar === i ? "page" : undefined}
                onClick={() => setBar(i)}
              >
                Bar {i + 1}
              </button>
            ))}
          </nav>
          {compact && (
            <nav className="generator-bars" aria-label="Beats within bar">
              {[0, 1, 2, 3].map((i) => (
                <button
                  key={i}
                  type="button"
                  aria-current={beat === i ? "page" : undefined}
                  onClick={() => setBeat(i)}
                >
                  Beat {i + 1}
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
                gridTemplateColumns: `80px repeat(${columns},minmax(0,1fr))`,
              }}
            >
              <span className="generator-row-label generator-corner">
                SOUND / BEAT
              </span>
              {Array.from({ length: columns }, (_, i) => {
                const n = i + offset;
                return (
                  <span
                    key={n}
                    className={`generator-step-number ${playhead === n ? "current" : ""}`}
                  >
                    {n % perBeat === 0
                      ? (n % gridResolution) / perBeat + 1
                      : gridResolution === 16
                        ? ["", "e", "&", "a"][n % 4]
                        : "·"}
                  </span>
                );
              })}
              {shown.map((d) => (
                <div className="generator-grid-row" key={d.id}>
                  <span className="generator-row-label">{d.name}</span>
                  {Array.from({ length: columns }, (_, i) => {
                    const n = i + offset,
                      v = groove?.steps[n][d.id] ?? 0;
                    return (
                      <button
                        type="button"
                        key={n}
                        disabled={!groove || busy}
                        className={`generator-cell ${v ? "on" : ""} ${n % perBeat === 0 ? "beat-start" : ""} ${playhead === n ? "current" : ""}`}
                        style={{ "--strength": v / 127 } as React.CSSProperties}
                        aria-label={`${d.name}, step ${n + 1}: ${v ? "velocity " + v : "rest"}. Change intensity.`}
                        aria-pressed={v > 0}
                        onClick={() => edit(n, d.id)}
                      >
                        {v > 0 && <span />}
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
              {elapsed !== null
                ? `${calls} model calls · ${elapsed.toFixed(2)}s to arrange`
                : "Authored drum vocabulary · arranged by TypeSafe"}
            </span>
          </div>
          <p className="generator-message" role="status">
            {message}
          </p>
        </section>
      </main>
    </div>
  );
}
