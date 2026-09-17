import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LiveDrummer,
  emptyStep,
  type LiveCallbacks,
} from "../src/live-drummer";
const intent = {
  foundation: "backbeat",
  timekeeping: "eighths",
  voice: "closed",
  variation: "steady",
  syncopation: "straight",
};
afterEach(() => vi.useRealTimers());
function setup(delayed = false) {
  vi.useFakeTimers();
  let time = 0;
  const callbacks: LiveCallbacks = {
    now: () => time,
    click: vi.fn(),
    hit: vi.fn(),
    position: vi.fn(),
    decisions: vi.fn(),
    direction: vi.fn(),
    usage: vi.fn(),
    status: vi.fn(),
  };
  const pending: (() => void)[] = [];
  const fetcher = vi.fn<typeof fetch>(async (_, init) => {
    const body = JSON.parse(init!.body as string);
    if (body.planOnly)
      return Response.json({ intent, modelCalls: 1, inputTokens: 100 });
    if (delayed) await new Promise<void>((resolve) => pending.push(resolve));
    return Response.json({
      start: body.batchStart,
      steps: Array.from({ length: body.batchSize }, () => ({
        ...emptyStep(),
        kick: 104,
      })),
      inputTokens: 100,
      modelCalls: 1,
    });
  });
  const drummer = new LiveDrummer(
    { prompt: "Rock", bpm: 120, bars: 4, resolution: 16 },
    callbacks,
    fetcher,
  );
  return {
    drummer,
    callbacks,
    fetcher,
    pending,
    setTime: (value: number) => {
      time = value;
    },
    flush: () => vi.advanceTimersByTimeAsync(0),
  };
}
describe("live drummer audio transport", () => {
  it("starts the click before inference, fills parallel decisions and keeps exact audio times", async () => {
    const t = setup();
    t.drummer.start();
    expect(t.callbacks.click).toHaveBeenCalledWith(0.08, false);
    await t.flush();
    expect(t.fetcher.mock.calls.length).toBeGreaterThan(2);
    t.setTime(1.5);
    t.drummer.tick();
    expect(t.callbacks.hit).toHaveBeenCalledWith(
      1.58,
      expect.objectContaining({ kick: 104 }),
    );
    t.drummer.stop();
  });
  it("drops late decisions rather than triggering them at the wrong time", async () => {
    const t = setup(true);
    t.drummer.start();
    await t.flush();
    t.setTime(2.2);
    t.drummer.tick();
    t.pending.forEach((resolve) => resolve());
    await t.flush();
    for (const [time] of vi.mocked(t.callbacks.hit).mock.calls)
      expect(time).toBeGreaterThanOrEqual(2.2);
    const first = vi
      .mocked(t.callbacks.decisions)
      .mock.calls.find(([start]) => start === 0)!;
    expect(first[1].every((step) => step.kick === 0)).toBe(true);
    t.drummer.stop();
  });
  it("sends live prompt changes on new decisions and stops all further work", async () => {
    const t = setup();
    t.drummer.start();
    await t.flush();
    t.drummer.setPrompt("Only a sparse kick");
    t.setTime(4);
    t.drummer.tick();
    await t.flush();
    expect(
      t.fetcher.mock.calls.some(
        ([, init]) =>
          JSON.parse(init!.body as string).prompt === "Only a sparse kick",
      ),
    ).toBe(true);
    t.drummer.stop();
    const count = t.fetcher.mock.calls.length;
    t.setTime(10);
    t.drummer.tick();
    await t.flush();
    expect(t.fetcher).toHaveBeenCalledTimes(count);
  });
  it("does not send audio or UI updates when stopped with pending calls", async () => {
    const t = setup(true);
    t.drummer.start();
    await t.flush();
    t.drummer.stop();
    t.pending.forEach((resolve) => resolve());
    await t.flush();
    expect(t.callbacks.decisions).not.toHaveBeenCalled();
    expect(t.callbacks.hit).not.toHaveBeenCalled();
  });
});
