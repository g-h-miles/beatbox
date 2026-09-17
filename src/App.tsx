import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  AudioLines,
  Check,
  ChevronRight,
  Disc3,
  Mic,
  Play,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  Upload,
  Volume2,
  WandSparkles,
  X,
} from "lucide-react";
import { demoBuffer, drumSound, features, MAX_SECONDS, mono } from "./audio";
import { drums, type Drum, type Hit } from "./model";
import { applyRhythm, estimateTempo, inferGrid, probabilities } from "./rhythm";
import { detectHits } from "./detect";
import { applyCoreLabels, type CoreLabel } from "./core-labels";
import { supportsRelative } from "./core-diversity";
import { predictBrowserSounds } from "./research-browser-model/classifier";
import { midi } from "./midi";
import { spectralDistance } from "./evidence";
const fmt = (t: number) =>
  `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;
export default function App() {
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null),
    [samples, setSamples] = useState<Float32Array | null>(null),
    [rawHits, setHits] = useState<Hit[]>([]),
    [name, setName] = useState(""),
    [selected, setSelected] = useState<string | null>(null);
  const [recording, setRecording] = useState(false),
    [recordTime, setRecordTime] = useState(0),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [configured, setConfigured] = useState(false),
    [drag, setDrag] = useState(false),
    [sensitivity, setSensitivity] = useState(50),
    [mode, setMode] = useState<"hits" | "syllables">("hits"),
    [bpm, setBpm] = useState(120),
    [grooveAssist, setGrooveAssist] = useState(true),
    [beatOne, setBeatOne] = useState<number | null>(null),
    [playing, setPlaying] = useState<"original" | "drums" | null>(null),
    [position, setPosition] = useState(0),
    [activePad, setActivePad] = useState<Drum | null>(null),
    [help, setHelp] = useState(false);
  const helpButton = useRef<HTMLButtonElement>(null);
  const detection = useRef<AbortController | null>(null);
  const classification = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    context = useRef<AudioContext | null>(null),
    recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    nodes = useRef<AudioScheduledSourceNode[]>([]),
    frame = useRef(0),
    recordStart = useRef(0),
    generation = useRef(0),
    padTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const grid = useMemo(
    () => inferGrid(rawHits, bpm, beatOne),
    [rawHits, bpm, beatOne],
  );
  const hits = useMemo(
    () => applyRhythm(rawHits, grid, grooveAssist),
    [rawHits, grid, grooveAssist],
  );
  const rhythmChanges = hits.filter((h) => h.rhythmAdjusted).length;
  const hasGrooveCandidates = rawHits.some(
    (h) =>
      !h.confirmedDrum &&
      h.source === "typesafe" &&
      (h.drum === "kick" || h.drum === "snare") &&
      h.probabilities,
  );
  const duration = buffer?.duration || 5,
    hit = hits.find((h) => h.id === selected),
    disabled = !!busy || recording;
  function audio() {
    return context.current ?? (context.current = new AudioContext());
  }
  function stop() {
    nodes.current.forEach((n) => {
      try {
        n.stop();
      } catch {
        /* already ended */
      }
    });
    nodes.current = [];
    cancelAnimationFrame(frame.current);
    setPlaying(null);
    setPosition(0);
  }
  async function pad(d: Drum) {
    const ctx = audio();
    await ctx.resume();
    drumSound(ctx, d, ctx.currentTime);
    setActivePad(d);
    if (padTimer.current) clearTimeout(padTimer.current);
    padTimer.current = setTimeout(() => setActivePad(null), 140);
  }
  useEffect(() => {
    fetch("/api/status")
      .then((r) =>
        r.ok ? (r.json() as Promise<{ configured: boolean }>) : null,
      )
      .then((v) => setConfigured(!!v?.configured))
      .catch(() => {});
    return () => {
      detection.current?.abort();
      classification.current?.abort();
      stream.current?.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(frame.current);
      void context.current?.close();
    };
  }, []);
  useEffect(() => {
    if (!help) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHelp(false);
        helpButton.current?.focus();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [help]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(e.target.tagName)
      )
        return;
      const d = drums.find((d) => d.key === e.key);
      if (d && !e.repeat) void pad(d.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      const t = (Date.now() - recordStart.current) / 1000;
      setRecordTime(t);
      if (t >= MAX_SECONDS) recorder.current?.stop();
    }, 100);
    return () => clearInterval(timer);
  }, [recording]);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const draw = () => {
      const r = el.getBoundingClientRect(),
        dpr = window.devicePixelRatio || 1;
      el.width = r.width * dpr;
      el.height = r.height * dpr;
      const ctx = el.getContext("2d")!;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, r.width, r.height);
      ctx.strokeStyle = "#d8dcd6";
      ctx.beginPath();
      ctx.moveTo(0, r.height / 2);
      ctx.lineTo(r.width, r.height / 2);
      ctx.stroke();
      if (!samples) return;
      const count = Math.floor(r.width / 3);
      let peak = 0;
      for (const v of samples) peak = Math.max(peak, Math.abs(v));
      ctx.fillStyle = "#69776b";
      for (let i = 0; i < count; i++) {
        let p = 0;
        const a = Math.floor((i * samples.length) / count),
          b = Math.floor(((i + 1) * samples.length) / count);
        for (let j = a; j < b; j++) p = Math.max(p, Math.abs(samples[j]));
        const h = Math.max(2, (p / (peak || 1)) * (r.height - 18));
        ctx.fillRect(i * 3, (r.height - h) / 2, 2, h);
      }
    };
    const observer = new ResizeObserver(draw);
    observer.observe(el);
    draw();
    return () => observer.disconnect();
  }, [samples]);
  async function findHits(
    data: Float32Array,
    sampleRate: number,
    nextMode = mode,
  ) {
    detection.current?.abort();
    const controller = new AbortController();
    detection.current = controller;
    const version = ++generation.current;
    const result = await detectHits(
      data,
      sampleRate,
      sensitivity,
      nextMode,
      controller.signal,
      (fraction) => setBusy(`Finding hits… ${Math.round(fraction * 100)}%`),
    );
    if (controller.signal.aborted || version !== generation.current)
      throw new DOMException("Cancelled", "AbortError");
    return result;
  }
  async function loadBuffer(decoded: AudioBuffer, fileName: string) {
    if (decoded.duration > MAX_SECONDS)
      throw Error(
        `Keep it under ${MAX_SECONDS} seconds for this little beat machine.`,
      );
    const data = mono(decoded);
    const { hits: found, fallback } = await findHits(data, decoded.sampleRate);
    setBuffer(decoded);
    setSamples(data);
    setName(fileName);
    setHits(found);
    setBeatOne(null);
    setSelected(null);
    setMessage(
      fallback
        ? "The precise detector could not load. Basic detection is ready; check the hit list."
        : found.length
          ? `${found.length} hits found. Classify them, then compare the preview with your recording.`
          : "No hits detected. Increase sensitivity or try a louder recording.",
    );
  }
  async function loadFile(file?: File) {
    if (!file || disabled) return;
    stop();
    setBusy("Listening for hits…");
    setMessage("");
    try {
      if (file.size > 30 * 1024 * 1024)
        throw Error("Please use an audio file smaller than 30 MB.");
      const decoded = await audio().decodeAudioData(await file.arrayBuffer());
      await loadBuffer(decoded, file.name);
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Could not decode that audio. Try WAV, MP3, M4A or WebM.",
      );
    } finally {
      setBusy("");
      if (input.current) input.current.value = "";
    }
  }
  async function demo() {
    stop();
    setBusy("Making a little groove…");
    try {
      await loadBuffer(await demoBuffer(), "Pocket groove · synthetic demo");
    } catch {
      setMessage("Could not create the demo audio.");
    } finally {
      setBusy("");
    }
  }
  async function record() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    stop();
    setMessage("");
    setBusy("Opening microphone…");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error(
          "Recording needs HTTPS and a browser with microphone support.",
        );
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const rec = new MediaRecorder(stream.current);
      recorder.current = rec;
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onerror = () => {
        setMessage("Recording failed. Try a file instead.");
        stream.current?.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setBusy("");
      };
      rec.onstop = async () => {
        stream.current?.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setBusy("Finding your rhythm…");
        try {
          const data = await new Blob(chunks, {
            type: rec.mimeType,
          }).arrayBuffer();
          await loadBuffer(
            await audio().decodeAudioData(data),
            "Mic take · " +
              new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
          );
        } catch {
          setMessage(
            "Could not read the recording. Try recording a longer take.",
          );
        } finally {
          setBusy("");
        }
      };
      recordStart.current = Date.now();
      setRecordTime(0);
      rec.start();
      setRecording(true);
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Microphone unavailable. Please check browser permissions.",
      );
    } finally {
      setBusy("");
    }
  }
  async function play(mode: "original" | "drums", only?: Hit) {
    if (playing && !only) {
      stop();
      return;
    }
    stop();
    const ctx = audio();
    await ctx.resume();
    const start = ctx.currentTime + 0.045;
    let length = duration;
    if (mode === "original" && buffer) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      const offset = only?.time || 0;
      length = only
        ? Math.min(only.duration + 0.04, duration - offset)
        : duration;
      source.start(start, offset, length);
      nodes.current.push(source);
    } else {
      const list = only ? [only] : hits;
      length = only ? 1 : duration;
      for (const h of list)
        nodes.current.push(
          ...drumSound(ctx, h.drum, start + (only ? 0 : h.time), h.velocity),
        );
    }
    setPlaying(mode);
    const tick = () => {
      const p = ctx.currentTime - start;
      if (p >= length) {
        stop();
        return;
      }
      setPosition(Math.max(0, p) + (only?.time || 0));
      frame.current = requestAnimationFrame(tick);
    };
    tick();
  }
  function update(patch: Partial<Hit>) {
    if (!hit) return;
    stop();
    setHits((list) =>
      list.map((h) =>
        h.id === hit.id
          ? {
              ...h,
              ...patch,
              drum: patch.drum ?? hit.drum,
              source: "manual",
              confidence: null,
              confirmedDrum: patch.drum !== undefined || h.confirmedDrum,
            }
          : h,
      ),
    );
  }
  function teachSimilar() {
    if (!hit) return;
    setHits((list) =>
      list.map((h) => {
        if (
          h.id === hit.id ||
          spectralDistance(h.features, hit.features) < 0.5
        ) {
          return {
            ...h,
            drum: hit.drum,
            confirmedDrum: true,
            source: "manual" as const,
            confidence: null,
          };
        }
        return h;
      }),
    );
    setMessage(
      `Applied your ${drums.find((d) => d.id === hit.drum)!.name} label to similar sounds. Review the updated hit list.`,
    );
  }
  async function detect(nextMode = mode) {
    if (!samples || !buffer) return;
    stop();
    setBusy("Finding hits…");
    try {
      const result = await findHits(samples, buffer.sampleRate, nextMode);
      setHits(result.hits);
      setSelected(null);
      setBeatOne(null);
      setMessage(
        result.fallback
          ? "The precise detector could not load. Basic detection is ready; check the hit list."
          : "Hits detected again. Previous edits were replaced.",
      );
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setMessage("Could not detect hits. Please try again.");
    } finally {
      setBusy("");
    }
  }
  async function classify() {
    if (!hits.length) return;
    stop();
    const version = generation.current;
    classification.current?.abort();
    const controller = new AbortController();
    classification.current = controller;
    setBusy("Classifying your hits…");
    setMessage("");
    try {
      let next = [...hits];
      const pending = hits.filter(
        (h) => !h.confirmedDrum && h.source !== "manual",
      );
      let core: CoreLabel[] | null = null;
      let modelUnavailable = false;
      if (
        pending.length &&
        mode === "hits" &&
        samples &&
        buffer &&
        supportsRelative(hits.map((h) => h.features.spectrum))
      ) {
        setBusy("Recognizing kick, snare and hats…");
        try {
          const ordered = hits
            .map((hit, index) => ({ hit, index }))
            .sort((a, b) => a.hit.time - b.hit.time);
          const labels = await predictBrowserSounds(
            samples,
            buffer.sampleRate,
            ordered.map(({ hit }) => hit.time),
            controller.signal,
          );
          core = new Array(hits.length);
          ordered.forEach(({ index }, i) => {
            core![index] = labels[i];
          });
        } catch (error) {
          if (controller.signal.aborted) throw error;
          modelUnavailable = true;
        }
      }
      const examples = drums.flatMap((d) =>
        hits
          .filter((h) => h.confirmedDrum && h.drum === d.id)
          .slice(0, 3)
          .map(({ drum, features }) => ({ drum, features })),
      );
      for (let i = 0; i < pending.length; i += 24) {
        setBusy(
          `Classifying hits ${i + 1}–${Math.min(i + 24, pending.length)}…`,
        );
        const response = await fetch("/api/classify", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examples,
            hits: pending
              .slice(i, i + 24)
              .map(({ id, features }) => ({ id, features })),
          }),
        });
        const data = (await response.json()) as {
          error?: string;
          answers: {
            id: string;
            drum: Drum;
            confidence: number;
            probabilities?: unknown;
          }[];
        };
        if (!response.ok)
          throw Error(data.error || "Classification unavailable.");
        next = next.map((h) => {
          const a = data.answers.find((v: { id: string }) => v.id === h.id);
          return a
            ? {
                ...h,
                drum: a.drum,
                acousticDrum: a.drum,
                probabilities: probabilities(a.probabilities),
                rhythmAdjusted: false,
                confidence: a.confidence,
                source: "typesafe",
              }
            : h;
        });
      }
      if (version === generation.current && !controller.signal.aborted) {
        if (core) next = applyCoreLabels(next, core);
        setHits(next);
        setMessage(
          modelUnavailable
            ? "The local classifier is unavailable. TypeSafe suggestions are ready to review."
            : "Classification complete. Play the preview and check any wrong sounds.",
        );
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setMessage(
          e instanceof Error
            ? e.message
            : "Classification failed. Your hits are unchanged.",
        );
    } finally {
      setBusy("");
    }
  }
  function download() {
    const bytes = midi(hits, bpm, duration),
      blob = new Blob([new Uint8Array(bytes)], { type: "audio/midi" }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download =
      (name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]+/gi, "-") ||
        "beatbox") + ".mid";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setMessage(
      "MIDI downloaded. Import it at the same tempo in Logic to preserve seconds.",
    );
  }
  function addHit() {
    if (!samples || !buffer) return;
    const time = Math.min(position, duration - 0.01),
      f = features(
        samples,
        buffer.sampleRate,
        time,
        Math.min(duration, time + 0.1),
      );
    const id = `hit-${Math.max(0, ...hits.map((h) => Number(h.id.split("-")[1]))) + 1}`;
    setHits((v) => [
      ...v,
      {
        id,
        time,
        duration: 0.08,
        velocity: 90,
        drum: "kick",
        confidence: null,
        source: "manual",
        features: f,
      },
    ]);
    setSelected(id);
  }
  return (
    <div className="app">
      <header>
        <a className="wordmark" href="/" aria-label="Beatbox home">
          <span className="brand-icon">
            <AudioLines size={24} />
          </span>
          BEATBOX<span className="version">VOL. 01</span>
        </a>
        <div className="header-right">
          <span className="live-dot" /> A little noise. A lot of groove.
          <button
            ref={helpButton}
            className="text-button"
            aria-expanded={help}
            aria-controls="instructions"
            onClick={() => setHelp(!help)}
          >
            How it works <ArrowUpRight size={15} />
          </button>
        </div>
      </header>
      <main>
        <section className="intro">
          <div>
            <p className="eyebrow">THE MOUTH-TO-MIDI MACHINE</p>
            <h1>
              Good beats start
              <br />
              with a <span>little spit.</span>
            </h1>
            <p className="lede">
              Beatbox it. Hear it. Make it a drum track.
              <br />
              Keep your timing and swing. Quantize later if you want.
            </p>
          </div>
          <div className="recipe">
            <span>
              01 <b>Record or drop</b>
            </span>
            <ChevronRight />
            <span>
              02 <b>Check the sounds</b>
            </span>
            <ChevronRight />
            <span>
              03 <b>Download MIDI</b>
            </span>
          </div>
        </section>
        {help && (
          <section className="help" id="instructions">
            <button
              aria-label="Close instructions"
              onClick={() => {
                setHelp(false);
                helpButton.current?.focus();
              }}
            >
              <X size={16} />
            </button>
            <h2>Your groove, without the grid.</h2>
            <p>
              Record a beat or drop an audio file. Compare Original with Drum
              preview, then click a hit to change its sound or timing. Try
              Classify sounds for another set of suggestions.
            </p>
            <p>
              Set your Logic project to the export BPM, then drag the MIDI onto
              a software instrument track with a drum kit. Leave quantization
              off to keep your timing. Aux uses woodblock note 75. Your chosen
              kit will sound different from this preview.
            </p>
          </section>
        )}
        <section className="machine">
          <div className="machine-top">
            <span>
              <span className="status-light" /> GROOVE CAPTURE
            </span>
            <span>
              MONO IN <span className="arrow">→</span> MIDI OUT
            </span>
          </div>
          <div className="capture-row">
            <button
              className={`record ${recording ? "recording" : ""}`}
              disabled={!!busy}
              onClick={() => void record()}
            >
              {recording ? <Square size={19} /> : <Mic size={20} />}
              <span>
                {recording ? "Stop recording" : "Record a beat"}
                <small>
                  {recording ? fmt(recordTime) : "Just you and your microphone"}
                </small>
              </span>
              <span className="rec-dot" />
            </button>
            <span className="or">or</span>
            <button
              className={`drop ${drag ? "dragging" : ""}`}
              disabled={disabled}
              onClick={() => input.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                if (!disabled) setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                void loadFile(e.dataTransfer.files[0]);
              }}
            >
              <Upload size={20} />
              <span>
                Drop your audio here
                <small>or click to browse · up to 90 seconds / 30 MB</small>
              </span>
            </button>
            <input
              ref={input}
              type="file"
              accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm"
              hidden
              onChange={(e) => void loadFile(e.target.files?.[0])}
            />
          </div>
          <div
            className={`notice ${busy ? "busy" : ""}`}
            role="status"
            aria-live="polite"
          >
            {busy ||
              message ||
              (recording
                ? "Recording. Press Stop when you are done."
                : "Up to 90 seconds. No setup needed.")}
          </div>
          <div className="session-bar">
            <div>
              <span className="file-dot" />
              {buffer ? name : "No take yet. The mic is yours."}
            </div>
            <button
              className="text-button"
              disabled={disabled}
              onClick={() => void demo()}
            >
              {buffer ? "Load demo groove" : "Try a demo groove"}{" "}
              <ArrowUpRight size={14} />
            </button>
          </div>
          <div
            className={`timeline ${hits.length > 32 ? "dense" : ""}`}
            onClick={(e) => {
              if (buffer && !disabled) {
                const rect = e.currentTarget.getBoundingClientRect();
                stop();
                setPosition(
                  Math.max(
                    0,
                    Math.min(
                      duration,
                      ((e.clientX - rect.left) / rect.width) * duration,
                    ),
                  ),
                );
              }
            }}
          >
            <div className="ruler">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i}>{fmt((duration * i) / 4)}</span>
              ))}
            </div>
            <canvas
              ref={canvas}
              aria-label={
                buffer
                  ? "Audio waveform with detected hit markers"
                  : "Empty waveform"
              }
            />
            {!buffer && (
              <div className="wave-empty">
                <AudioLines size={26} />
                <span>Your next beat lives here.</span>
              </div>
            )}
            {hits.map((h) => (
              <button
                key={h.id}
                disabled={disabled}
                className={`marker ${selected === h.id ? "selected" : ""}`}
                style={{ left: `${(h.time / duration) * 100}%` }}
                aria-label={`${drums.find((d) => d.id === h.drum)!.name} at ${h.time.toFixed(3)} seconds`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(h.id);
                }}
              >
                <i />
                <span>{drums.find((d) => d.id === h.drum)!.syllable}</span>
              </button>
            ))}
            {buffer && (
              <div
                className="playhead"
                style={{ left: `${(position / duration) * 100}%` }}
              />
            )}
          </div>
          <div className="transport">
            <div className="transport-buttons">
              <button
                disabled={!buffer || disabled}
                onClick={() => void play("original")}
              >
                {playing === "original" ? (
                  <Square size={15} />
                ) : (
                  <Play size={15} />
                )}{" "}
                Original
              </button>
              <button
                disabled={!hits.length || disabled}
                onClick={() => void play("drums")}
              >
                {playing === "drums" ? (
                  <Square size={15} />
                ) : (
                  <Volume2 size={16} />
                )}{" "}
                Drum preview
              </button>
              <span className="time">
                {fmt(position)} <span>/ {fmt(buffer?.duration || 0)}</span>
              </span>
            </div>
            <span className="free-time">
              <Check size={14} /> Unquantized. Always.
            </span>
          </div>
          <div className="pads-label">
            <span>THE SOUND PALETTE</span>
            <span>Tap a pad. Or play keys 1–7.</span>
          </div>
          <div className="pads">
            {drums.map((d) => (
              <button
                className={`pad ${activePad === d.id ? "active" : ""}`}
                key={d.id}
                onClick={() => void pad(d.id)}
                aria-label={`Play ${d.name}`}
              >
                <span className="pad-top">
                  <span>{d.key}</span>
                  <span>{d.note}</span>
                </span>
                <b>{d.syllable}</b>
                <span className="pad-name">{d.name}</span>
              </button>
            ))}
          </div>
          <div className="machine-bottom">
            <span>
              <Disc3 size={13} /> MADE FOR THE POCKET, NOT THE GRID.
            </span>
            <span>GM / CH 10</span>
          </div>
        </section>
        <section className="workbench">
          <div className="editor">
            <div className="section-heading">
              <h2>
                The hit list{" "}
                <span>{hits.length.toString().padStart(2, "0")}</span>
              </h2>
              <button
                className="text-button"
                disabled={!buffer || disabled}
                onClick={addHit}
              >
                <Plus size={14} /> Add at cursor
              </button>
            </div>
            <div className="ai-block">
              <div>
                <WandSparkles size={17} />
                <b>Check the sounds</b>
                <span>{configured ? "CONNECTED" : "UNAVAILABLE"}</span>
              </div>
              <p>
                Listen to the drum preview. Click any hit to correct it, or try
                another classification pass.
              </p>
              <button
                disabled={!hits.length || disabled || !configured}
                onClick={() => void classify()}
              >
                <WandSparkles size={14} /> Classify sounds
              </button>
              {!configured && (
                <small>
                  Classification is unavailable. You can still edit and export.
                </small>
              )}
            </div>
            <div className="mode-control">
              <label htmlFor="detection-mode">Performance</label>
              <select
                id="detection-mode"
                disabled={disabled}
                value={mode}
                onChange={(e) => {
                  const next = e.target.value as "hits" | "syllables";
                  setMode(next);
                  if (samples && buffer) void detect(next);
                }}
              >
                <option value="hits">Beatbox hits</option>
                <option value="syllables">
                  Boots & cats · spoken syllables
                </option>
              </select>
            </div>
            <div className="detection">
              <label>
                Sensitivity{" "}
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sensitivity}
                  onChange={(e) => setSensitivity(+e.target.value)}
                  disabled={disabled}
                />
                <span>{sensitivity}</span>
              </label>
              <button
                disabled={!buffer || disabled}
                onClick={() => void detect()}
                title="Re-detect hits and replace edits"
              >
                <RotateCcw size={14} /> Re-detect
              </button>
            </div>
            {hit ? (
              <div className="hit-detail">
                <div>
                  <b>Edit hit</b>
                  <span>
                    {hit.source === "typesafe"
                      ? `${hit.rhythmAdjusted ? "Groove hint · " : ""}Model confidence ${Math.round((hit.confidence || 0) * 100)}%`
                      : hit.source === "model"
                        ? "Suggested sound · check the preview"
                        : hit.source === "manual"
                          ? "Edited by you"
                          : "Local suggestion · unverified"}
                  </span>
                  <button
                    onClick={() => setSelected(null)}
                    aria-label="Close hit editor"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="hit-fields">
                  <label>
                    Sound
                    <select
                      aria-label="Sound"
                      value={hit.drum}
                      disabled={disabled}
                      onChange={(e) => update({ drum: e.target.value as Drum })}
                    >
                      {drums.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} · {d.note}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Time (seconds)
                    <input
                      type="number"
                      min="0"
                      max={duration - 0.01}
                      step="0.001"
                      value={Number(hit.time.toFixed(4))}
                      disabled={disabled}
                      onChange={(e) => {
                        const t = Number(e.target.value);
                        if (Number.isFinite(t) && t >= 0 && t < duration)
                          update({
                            time: t,
                            ...(samples && buffer
                              ? {
                                  features: features(
                                    samples,
                                    buffer.sampleRate,
                                    t,
                                    Math.min(duration, t + hit.duration),
                                  ),
                                }
                              : {}),
                          });
                      }}
                    />
                  </label>
                  <label>
                    Velocity
                    <input
                      type="number"
                      min="1"
                      max="127"
                      value={hit.velocity}
                      disabled={disabled}
                      onChange={(e) =>
                        update({
                          velocity: Math.max(
                            1,
                            Math.min(127, +e.target.value || 1),
                          ),
                        })
                      }
                    />
                  </label>
                </div>
                <button
                  className="teach-button"
                  disabled={disabled}
                  onClick={teachSimilar}
                >
                  <WandSparkles size={13} /> Apply this label to similar hits
                </button>
                <div className="hit-actions">
                  <button
                    disabled={disabled}
                    onClick={() => void play("original", hit)}
                  >
                    <Play size={13} /> Hear slice
                  </button>
                  <button
                    disabled={disabled}
                    onClick={() => void pad(hit.drum)}
                  >
                    <Volume2 size={13} /> Hear drum
                  </button>
                  <button
                    disabled={disabled}
                    aria-label="Delete selected hit"
                    onClick={() => {
                      stop();
                      setHits(hits.filter((h) => h.id !== hit.id));
                      setSelected(null);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ) : null}
            <div className="hit-list">
              {!hits.length ? (
                <div className="empty-hits">
                  <AudioLines size={22} />
                  <p>No hits yet.</p>
                  <span>Record a beat or drop a file above.</span>
                </div>
              ) : (
                <>
                  <div className="table-head">
                    <span>HIT / SOUND</span>
                    <span>TIME</span>
                    <span>VEL</span>
                    <span>LABEL</span>
                  </div>
                  {[...hits]
                    .sort((a, b) => a.time - b.time)
                    .map((h, i) => (
                      <button
                        disabled={disabled}
                        className={`hit-row ${selected === h.id ? "selected" : ""}`}
                        key={h.id}
                        onClick={() => setSelected(h.id)}
                      >
                        <span>
                          <small>{String(i + 1).padStart(2, "0")}</small>
                          {drums.find((d) => d.id === h.drum)!.name}
                        </span>
                        <span>{h.time.toFixed(3)}s</span>
                        <span>{h.velocity}</span>
                        <span className={h.source === "manual" ? "manual" : ""}>
                          {h.source === "typesafe"
                            ? h.rhythmAdjusted
                              ? "Groove hint"
                              : `${Math.round((h.confidence || 0) * 100)}%`
                            : h.source === "manual"
                              ? "Edited"
                              : h.source === "model"
                                ? "Suggested"
                                : "Review"}
                        </span>
                      </button>
                    ))}
                </>
              )}
            </div>
          </div>
          <aside>
            <div className="section-heading">
              <h2>Make it a track</h2>
              <span className="step-number">03</span>
            </div>
            <p>
              Choose the tempo you will use in Logic. Hit timing stays
              unchanged.
            </p>
            <div className="tempo">
              <label htmlFor="tempo">
                Tempo <small>Match this in your DAW</small>
              </label>
              <div>
                <input
                  id="tempo"
                  type="number"
                  step="0.5"
                  min="30"
                  max="300"
                  value={bpm}
                  disabled={disabled}
                  onChange={(e) => {
                    stop();
                    setBpm(Math.max(30, Math.min(300, +e.target.value || 120)));
                  }}
                />
                <span>BPM</span>
              </div>
            </div>
            {hasGrooveCandidates && (
              <details className="groove-controls">
                <summary>
                  Groove hints <span>{grooveAssist ? "On" : "Off"}</span>
                </summary>
                <button
                  disabled={hits.length < 6 || disabled}
                  onClick={() => {
                    const estimate = estimateTempo(hits);
                    if (estimate) {
                      stop();
                      setBpm(estimate.bpm);
                      setMessage(
                        `Estimated ${estimate.bpm} BPM. Check the pulse; half or double tempo may also fit.`,
                      );
                    } else
                      setMessage(
                        "No steady pulse found. Enter a tempo, or leave groove hints off.",
                      );
                  }}
                >
                  Estimate tempo
                </button>
                <label className="groove-toggle">
                  <input
                    type="checkbox"
                    checked={grooveAssist}
                    disabled={disabled}
                    onChange={(e) => {
                      stop();
                      setGrooveAssist(e.target.checked);
                    }}
                  />
                  Use 4/4 groove hints
                </label>
                <p>
                  Helps decide uncertain kicks and snares. Never moves a hit.
                </p>
                <div className="groove-actions">
                  <button
                    disabled={!hit || disabled}
                    onClick={() => {
                      if (hit) {
                        stop();
                        setBeatOne(hit.time);
                      }
                    }}
                  >
                    Selected hit is beat 1
                  </button>
                  {beatOne !== null && (
                    <button
                      disabled={disabled}
                      onClick={() => {
                        stop();
                        setBeatOne(null);
                      }}
                    >
                      Reset beat 1
                    </button>
                  )}
                </div>
                <p role="status">
                  {!grooveAssist
                    ? "Groove hints off."
                    : grid
                      ? `${grid.source === "manual" ? `Beat 1 at ${grid.origin.toFixed(3)}s` : "Kick/snare pulse inferred"} · ${rhythmChanges} label${rhythmChanges === 1 ? "" : "s"} adjusted.`
                      : "Set the tempo and choose beat 1, or classify to find a pulse."}
                </p>
              </details>
            )}
            <div className="export-facts">
              <span>
                Timing <b>Original · no snapping</b>
              </span>
              <span>
                Mapping <b>General MIDI drums</b>
              </span>
            </div>
            <button
              className="export primary"
              disabled={!hits.length || disabled}
              onClick={download}
            >
              <ArrowDownToLine size={18} /> Download MIDI{" "}
              <ArrowUpRight size={16} />
            </button>
            <p className="fine">
              Drag the downloaded .mid into Logic. Use the same BPM and leave
              quantization off.
            </p>
          </aside>
        </section>
        <p className="privacy">
          Audio stays in your browser. TypeSafe receives acoustic measurements
          when you choose to classify.
        </p>
        <footer>
          <span>BUILT FOR HAPPY ACCIDENTS.</span>
          <span>
            Keep it human. Keep the swing. <AudioLines size={15} />
          </span>
        </footer>
      </main>
    </div>
  );
}
