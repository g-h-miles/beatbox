import { barNotes, type BarGroove } from "./bar-groove";
export class BarPlayer {
  private timer?: ReturnType<typeof setInterval>;
  private nextBar = 0;
  private startTime = 0;
  private pending?: BarGroove;
  private stopped = false;
  private announced?: BarGroove;
  constructor(
    private groove: BarGroove,
    private bpm: number,
    private callbacks: {
      now: () => number;
      hit: (note: ReturnType<typeof barNotes>[number], time: number) => void;
      click: (time: number, accent: boolean) => void;
      bar: (groove: BarGroove) => void;
      position: (index: number) => void;
    },
  ) {}
  start() {
    this.startTime = this.callbacks.now() + 0.08;
    this.tick();
    this.timer = setInterval(() => this.tick(), 25);
  }
  queue(groove: BarGroove) {
    this.pending = groove;
  }
  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    this.pending = undefined;
  }
  tick() {
    if (this.stopped) return;
    const now = this.callbacks.now(),
      duration = 240 / this.bpm;
    // Skip expired bars after suspension; never burst old hits on resume.
    this.nextBar = Math.max(
      this.nextBar,
      Math.floor((now - this.startTime) / duration),
    );
    while (this.startTime + this.nextBar * duration < now + 0.12) {
      const start = this.startTime + this.nextBar * duration;
      if (this.pending && start >= now) {
        this.groove = this.pending;
        this.pending = undefined;
      }
      if (this.announced !== this.groove) {
        this.callbacks.bar(this.groove);
        this.announced = this.groove;
      }
      const resolution = this.groove.resolution ?? 16;
      const barIndex = this.nextBar % (this.groove.bars ?? 1);
      const barGroove = {
        ...this.groove,
        ...this.groove.arrangements?.[barIndex],
        arrangements: undefined,
        bars: 1,
        steps: this.groove.steps.slice(
          barIndex * resolution,
          (barIndex + 1) * resolution,
        ),
      };
      for (const note of barNotes(barGroove, this.bpm))
        if (start + note.time >= now)
          this.callbacks.hit(note, start + note.time);
      for (let beat = 0; beat < 4; beat++)
        if (start + (beat * duration) / 4 >= now)
          this.callbacks.click(start + (beat * duration) / 4, beat === 0);
      this.nextBar++;
    }
    this.callbacks.position(
      now < this.startTime
        ? -1
        : Math.floor(
            (((now - this.startTime) % (duration * (this.groove.bars ?? 1))) /
              duration) *
              (this.groove.resolution ?? 16),
          ),
    );
  }
}
