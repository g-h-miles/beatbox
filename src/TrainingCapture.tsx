import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  Check,
  Mic,
  Square,
  Volume2,
} from "lucide-react";
import { drums, type Drum } from "./model";
import { drumSound } from "./audio";
import "./training.css";

type Take = {
  id: string;
  drum: Drum;
  round: number;
  blob: Blob;
  duration: number;
  createdAt: string;
};
const database = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("beatbox-training", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("takes", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
async function storeTake(take: Take) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("takes", "readwrite");
    tx.objectStore("takes").put(take);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
const base64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export default function TrainingCapture() {
  const [selected, setSelected] = useState<Drum>("kick");
  const [round, setRound] = useState(1);
  const [takes, setTakes] = useState<Record<string, Take>>({});
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState("");
  const [playback, setPlayback] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const started = useRef(0);
  const context = useRef<AudioContext | null>(null);
  const mounted = useRef(true);
  const id = `${selected}-${round}`;
  const take = takes[id];
  const drum = drums.find((d) => d.id === selected)!;

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        const db = await database();
        const entries = await new Promise<Take[]>((resolve, reject) => {
          const request = db.transaction("takes").objectStore("takes").getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        db.close();
        if (mounted.current)
          setTakes(Object.fromEntries(entries.map((t) => [t.id, t])));
      } catch {
        if (mounted.current)
          setNotice(
            "Browser storage is unavailable. Download your recordings before leaving this page.",
          );
      }
    })();
    return () => {
      mounted.current = false;
      if (recorder.current) {
        recorder.current.onstop = null;
        if (recorder.current.state === "recording") recorder.current.stop();
      }
      stream.current?.getTracks().forEach((track) => track.stop());
      void context.current?.close();
    };
  }, []);
  useEffect(() => {
    if (!take) {
      setPlayback("");
      return;
    }
    const url = URL.createObjectURL(take.blob);
    setPlayback(url);
    return () => URL.revokeObjectURL(url);
  }, [take]);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      const seconds = (Date.now() - started.current) / 1000;
      setElapsed(seconds);
      if (seconds >= 60 && recorder.current?.state === "recording")
        recorder.current.stop();
    }, 100);
    return () => clearInterval(timer);
  }, [recording]);

  async function record() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      stream.current = mic;
      if (!mounted.current) {
        mic.getTracks().forEach((track) => track.stop());
        return;
      }
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/webm",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const rec = new MediaRecorder(mic, mimeType ? { mimeType } : undefined);
      recorder.current = rec;
      const chunks: Blob[] = [];
      rec.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      rec.onerror = () => {
        mic.getTracks().forEach((track) => track.stop());
        setRecording(false);
        setNotice("Recording failed. Please try again.");
      };
      rec.onstop = async () => {
        mic.getTracks().forEach((track) => track.stop());
        if (!mounted.current) return;
        setRecording(false);
        setBusy(true);
        const duration = (Date.now() - started.current) / 1000;
        const blob = new Blob(chunks, {
          type: rec.mimeType || chunks[0]?.type || "audio/webm",
        });
        if (duration < 0.5 || !blob.size) {
          setNotice("That take was too short. Record a few sounds, then stop.");
          setBusy(false);
          return;
        }
        const saved: Take = {
          id,
          drum: selected,
          round,
          blob,
          duration,
          createdAt: new Date().toISOString(),
        };
        setTakes((previous) => ({ ...previous, [id]: saved }));
        try {
          await storeTake(saved);
          setNotice(
            `${drum.name} ${round === 1 ? "training recording" : "separate check"}, saved on this device.`,
          );
        } catch {
          setNotice(
            "Recorded, but browser storage is full. Download your pack before leaving.",
          );
        } finally {
          if (mounted.current) setBusy(false);
        }
      };
      started.current = Date.now();
      setElapsed(0);
      rec.start(250);
      setRecording(true);
    } catch (error) {
      stream.current?.getTracks().forEach((track) => track.stop());
      setNotice(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Allow microphone access in your browser, then try again."
          : "Could not start the microphone. Check that it is connected.",
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function preview() {
    context.current ??= new AudioContext();
    await context.current.resume();
    drumSound(context.current, selected, context.current.currentTime);
  }
  async function download() {
    setBusy(true);
    try {
      const recordings = await Promise.all(
        Object.values(takes).map(async (t) => ({
          id: t.id,
          drum: t.drum,
          split: t.round === 1 ? "training" : "holdout",
          mimeType: t.blob.type,
          duration: t.duration,
          createdAt: t.createdAt,
          audioBase64: await base64(t.blob),
        })),
      );
      const pack = {
        format: "beatbox-training-v1",
        createdAt: new Date().toISOString(),
        labelSource:
          "Drum category selected by the performer; onset times are not annotated.",
        recordings,
      };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(pack)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "my-beatbox-training.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Training pack downloaded. Nothing was uploaded.");
    } catch {
      setNotice(
        "Could not create the download. Your saved takes are still on this device.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="training-page">
      <header>
        <a className="wordmark" href="/">
          BEATBOX<span className="training-tag">SOUND LAB</span>
        </a>
        <a className="training-back" href="/">
          <ArrowLeft size={16} /> Back to the groove
        </a>
      </header>
      <main className="training-main">
        <div className="training-intro">
          <p className="eyebrow">YOUR VOICE. YOUR KIT.</p>
          <h1>Let’s learn your sounds.</h1>
          <p>
            Give each sound up to a minute. Training recordings teach the model
            your voice; separate check recordings measure what it learned.
          </p>
        </div>
        <div className="training-workspace">
          <nav aria-label="Choose a drum" className="training-drums">
            {drums.map((d) => (
              <button
                key={d.id}
                aria-pressed={selected === d.id}
                disabled={recording || busy}
                onClick={() => {
                  setSelected(d.id);
                  setNotice("");
                }}
              >
                <span>
                  <b>{d.name}</b>
                  <small>{d.syllable}</small>
                </span>
                <span className="training-count">
                  {[1, 2].filter((n) => takes[`${d.id}-${n}`]).length}/2
                </span>
              </button>
            ))}
          </nav>
          <section
            className="training-recorder"
            aria-labelledby="training-drum-title"
          >
            <div
              className="training-takes"
              role="group"
              aria-label="Recording take"
            >
              {[1, 2].map((n) => (
                <button
                  key={n}
                  aria-pressed={round === n}
                  disabled={recording || busy}
                  onClick={() => {
                    setRound(n);
                    setNotice("");
                  }}
                >
                  {takes[`${selected}-${n}`] && <Check size={14} />}{" "}
                  {n === 1 ? "Training" : "Separate check"}
                </button>
              ))}
            </div>
            <p className="eyebrow">
              {round === 1
                ? "USED TO TRAIN THE MODEL"
                : "EXCLUDED FROM TRAINING"}
            </p>
            {round === 2 && (
              <p className="training-purpose">
                This recording is only for checking recognition. It will not be
                used to train the model.
              </p>
            )}
            <h2 id="training-drum-title">Your {drum.name.toLowerCase()}.</h2>
            <p>
              Repeat this sound for up to 60 seconds. Vary the strength and
              speed, leaving small gaps. Use your natural beatbox voice; there’s
              no required number of hits.
            </p>
            <button
              className="training-listen"
              onClick={() => void preview()}
              disabled={recording || busy}
            >
              <Volume2 size={16} /> Hear the drum
            </button>
            <div
              className={`training-clock ${recording ? "is-recording" : ""}`}
              aria-live="off"
            >
              <span>
                {recording
                  ? "RECORDING"
                  : take
                    ? "TAKE SAVED"
                    : "READY WHEN YOU ARE"}
              </span>
              <strong>
                {(recording ? elapsed : (take?.duration ?? 0)).toFixed(1)}
                <small> / 60s</small>
              </strong>
              <progress
                aria-label="Recording duration"
                value={recording ? elapsed : (take?.duration ?? 0)}
                max={60}
              />
            </div>
            <button
              className="primary training-record"
              disabled={busy}
              onClick={() => void record()}
            >
              {recording ? <Square size={18} /> : <Mic size={18} />}
              {recording
                ? "Stop recording"
                : take
                  ? "Record a new take"
                  : `Record ${drum.name.toLowerCase()}`}
            </button>
            {playback && !recording && (
              <audio
                controls
                src={playback}
                aria-label={`Listen to ${drum.name} ${round === 1 ? "training recording" : "separate check"}`}
              />
            )}
          </section>
        </div>
        <div className="training-download">
          <div>
            <b>
              {Object.values(takes).filter((t) => t.round === 1).length} of 7
              training recordings saved ·{" "}
              {Object.values(takes).filter((t) => t.round === 2).length}{" "}
              separate checks
            </b>
            <p>
              Start with the seven Training recordings. Separate check
              recordings are optional for now and never go into training. A
              mixed groove will be checked separately later.
            </p>
          </div>
          <button
            className="primary"
            disabled={!Object.keys(takes).length || busy || recording}
            onClick={() => void download()}
          >
            <ArrowDownToLine size={17} /> Download training pack
          </button>
        </div>
        <p className="training-privacy">
          Recordings stay in this browser. Downloading creates a file for you to
          share when you choose; it does not upload or publish your voice.
        </p>
        <div className="notice" role="status" aria-live="polite">
          {notice ||
            (busy
              ? "One moment…"
              : "Each recording uses the drum label you choose.")}
        </div>
      </main>
    </div>
  );
}
