import { drums } from "./model";
import { VELOCITIES, type BeatStep, type MusicalIntent } from "./generator";

export const emptyStep = (): BeatStep =>
  Object.fromEntries(drums.map((d) => [d.id, 0])) as BeatStep;
export type LiveSettings = {
  prompt: string;
  bpm: number;
  bars: number;
  resolution: number;
};
export type LiveCallbacks = {
  now: () => number;
  click: (time: number, accent: boolean) => void;
  hit: (time: number, step: BeatStep) => void;
  position: (index: number, countdown: number) => void;
  decisions: (start: number, steps: BeatStep[]) => void;
  direction: (intent: MusicalIntent) => void;
  usage: (calls: number, tokens: number | null) => void;
  status: (message: string) => void;
};

// Audio time owns the transport. Network completion never triggers immediate sound.
export class LiveDrummer {
  private abort = new AbortController();
  private timer?: ReturnType<typeof setInterval>;
  private notes = new Map<number, BeatStep>();
  private nextScheduled = 0;
  private nextClick = 0;
  private nextBatch = 0;
  private activeRequests = 0;
  private lastPosition = -2;
  private dropped = 0;
  private plan?: { prompt: string; result: Promise<MusicalIntent> };
  private started = 0;
  private downbeat = 0;
  private backoffUntil = 0;
  private lastDirection = "";
  private readonly interval: number;
  private readonly beatDuration: number;
  private readonly countIn: number;
  private readonly lookahead = 1.8;
  private readonly batchSize: number;
  private pendingPrompt: string;

  constructor(
    private settings: LiveSettings,
    private callbacks: LiveCallbacks,
    private fetcher: typeof fetch = (...args) => fetch(...args),
  ) {
    this.interval = 240 / settings.bpm / settings.resolution;
    this.beatDuration = 60 / settings.bpm;
    this.countIn = Math.ceil(1.5 / this.beatDuration);
    this.batchSize = Math.min(8, settings.resolution / 4);
    this.pendingPrompt = settings.prompt;
  }
  setPrompt(prompt: string) {
    this.pendingPrompt = prompt.trim() || this.pendingPrompt;
  }
  start() {
    this.started = this.callbacks.now() + 0.08;
    this.downbeat = this.started + this.countIn * this.beatDuration;
    this.callbacks.status("Counting in. TypeSafe is choosing the first hits…");
    this.tick();
    this.timer = setInterval(() => this.tick(), 25);
  }
  stop() {
    this.abort.abort();
    clearInterval(this.timer);
    this.notes.clear();
  }
  private async request(extra: Record<string, unknown>, prompt: string) {
    this.abort.signal.throwIfAborted();
    const response = await this.fetcher("/api/generate-step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...this.settings, prompt, history: [], ...extra }),
      signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(8000)]),
    });
    const data = (await response.json()) as {
      error?: string;
      intent?: MusicalIntent;
      steps?: BeatStep[];
      start?: number;
      inputTokens?: number;
      modelCalls?: number;
    };
    this.abort.signal.throwIfAborted();
    if (!response.ok) {
      if (response.status === 429)
        this.backoffUntil = this.callbacks.now() + 60;
      else this.backoffUntil = this.callbacks.now() + 2;
      throw Error(
        data.error ||
          "The drummer lost its connection. The click is still running.",
      );
    }
    this.callbacks.usage(
      data.modelCalls ?? 1,
      typeof data.inputTokens === "number" ? data.inputTokens : null,
    );
    return data;
  }
  private getPlan(prompt: string) {
    if (!this.plan || this.plan.prompt !== prompt) {
      const result = this.request({ planOnly: true }, prompt).then((data) => {
        if (!data.intent) throw Error("Invalid musical direction.");
        return data.intent;
      });
      this.plan = { prompt, result };
      // A failed plan must be retried after backoff, not cached forever.
      void result.catch(() => {
        if (this.plan?.result === result) this.plan = undefined;
      });
    }
    return this.plan.result;
  }
  private async decide(start: number, prompt: string) {
    this.activeRequests++;
    try {
      const intent = await this.getPlan(prompt);
      if (this.abort.signal.aborted) return;
      if (this.lastDirection !== prompt) {
        this.callbacks.direction(intent);
        this.lastDirection = prompt;
      }
      const slot = start % (this.settings.bars * this.settings.resolution);
      const data = await this.request(
        { intent, batchStart: slot, batchSize: this.batchSize },
        prompt,
      );
      if (
        data.start !== slot ||
        data.steps?.length !== this.batchSize ||
        data.steps.some(
          (step) =>
            !step ||
            drums.some(
              (d) => !(VELOCITIES as readonly number[]).includes(step[d.id]),
            ),
        )
      )
        throw Error("Invalid drum decisions. Keeping the click running.");
      const accepted: BeatStep[] = [];
      data.steps.forEach((step, i) => {
        const index = start + i;
        // Never play a stale decision late, or place it in a later loop.
        if (
          index >= this.nextScheduled &&
          this.downbeat + index * this.interval > this.callbacks.now() + 0.02
        ) {
          this.notes.set(index, step);
          accepted.push(step);
        } else accepted.push(emptyStep());
      });
      this.callbacks.decisions(start, accepted);
    } catch (error) {
      if (!this.abort.signal.aborted)
        this.callbacks.status(
          error instanceof Error
            ? error.message
            : "Connection interrupted. The click keeps time.",
        );
    } finally {
      this.activeRequests--;
    }
  }
  tick() {
    if (this.abort.signal.aborted) return;
    const now = this.callbacks.now();
    // Skip elapsed ticks after a suspended/backgrounded tab; never emit a catch-up burst.
    this.nextClick = Math.max(
      this.nextClick,
      Math.ceil((now - this.started) / this.beatDuration),
    );
    while (this.started + this.nextClick * this.beatDuration < now + 0.12) {
      this.callbacks.click(
        this.started + this.nextClick * this.beatDuration,
        (this.nextClick - this.countIn) % 4 === 0,
      );
      this.nextClick++;
    }
    const elapsedStep = Math.max(
      0,
      Math.ceil((now - this.downbeat) / this.interval),
    );
    if (elapsedStep > this.nextScheduled) {
      for (const index of this.notes.keys())
        if (index < elapsedStep) this.notes.delete(index);
      this.nextScheduled = elapsedStep;
    }
    while (this.downbeat + this.nextScheduled * this.interval < now + 0.12) {
      const time = this.downbeat + this.nextScheduled * this.interval;
      const step = this.notes.get(this.nextScheduled);
      if (step) this.callbacks.hit(time, step);
      else this.dropped++;
      this.notes.delete(this.nextScheduled++);
    }
    const position = Math.floor((now - this.downbeat) / this.interval);
    if (position !== this.lastPosition) {
      this.lastPosition = position;
      this.callbacks.position(
        position,
        Math.max(0, Math.ceil((this.downbeat - now) / this.beatDuration)),
      );
      if (position === 0)
        this.callbacks.status(
          "Live. Change the groove while the drummer plays.",
        );
      if (
        position >= 0 &&
        position % this.settings.resolution === 0 &&
        this.dropped
      )
        this.callbacks.status(
          `${this.dropped} late positions skipped. The click stays on time.`,
        );
    }
    this.nextBatch = Math.max(
      this.nextBatch,
      Math.ceil(elapsedStep / this.batchSize) * this.batchSize,
    );
    while (
      this.activeRequests < 12 &&
      now >= this.backoffUntil &&
      this.downbeat + this.nextBatch * this.interval <
        now +
          this.lookahead +
          this.countIn * this.beatDuration * (now < this.downbeat ? 1 : 0)
    ) {
      const start = this.nextBatch;
      this.nextBatch += this.batchSize;
      void this.decide(start, this.pendingPrompt);
    }
  }
}
