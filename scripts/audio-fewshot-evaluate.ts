/** Frozen few-shot audio diagnostic: no requests unless explicitly enabled. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
const out = "artifacts/audio-fewshot";
const bytes = readFileSync(`${out}/prepared.json`),
  sha = createHash("sha256").update(bytes).digest("hex");
if (sha !== readFileSync(`${out}/prepared.sha256`, "utf8").trim())
  throw Error("Prepared inputs changed");
const prepared = JSON.parse(bytes.toString());
const request = process.argv.includes("--request");
const endpoint = process.env.AUDIO_FEWSHOT_ENDPOINT;
if (request && !endpoint) throw Error("AUDIO_FEWSHOT_ENDPOINT required");
const labels = ["closed", "open", "kick", "snare", "ride", "crash", "aux"];
const core = (label: string) =>
  ["closed", "open"].includes(label) ? "hat" : label;
let previous = 0;
const rows: any[] = [];
if (
  prepared.examples.length !== 12 ||
  prepared.queries.length !== 12 ||
  prepared.queries.some(
    (q: any) => q.participant < 15 || q.participant > 20 || q.hits.length !== 8,
  )
)
  throw Error("Unexpected frozen cohort");
for (const row of prepared.queries) {
  const path = `${out}/${row.stem}-response.json`;
  let saved: any;
  if (existsSync(path)) {
    saved = JSON.parse(readFileSync(path, "utf8"));
    if (saved.preparedSha256 !== sha)
      throw Error("Cached prepared hash mismatch");
  } else if (request) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, 2300 - (Date.now() - previous))),
    );
    previous = Date.now();
    const start = Date.now();
    const response = await fetch(endpoint!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ examples: prepared.examples, hits: row.hits }),
      signal: AbortSignal.timeout(240000),
    });
    const text = await response.text();
    if (!response.ok) {
      writeFileSync(
        `${out}/${row.stem}-error.json`,
        JSON.stringify(
          { status: response.status, text, preparedSha256: sha },
          null,
          2,
        ),
      );
      throw Error(`Diagnostic endpoint status${response.status}`);
    }
    const body = JSON.parse(text);
    if (!Array.isArray(body.answers) || body.answers.length !== 8)
      throw Error("Expected8answers");
    for (const hit of row.hits)
      if (
        body.answers.filter(
          (a: any) => a.id === hit.id && labels.includes(a.drum),
        ).length !== 1
      )
        throw Error("Malformed or duplicate answer");
    saved = {
      preparedSha256: sha,
      file: row.file,
      elapsedMs: Date.now() - start,
      body,
    };
    writeFileSync(path, JSON.stringify(saved, null, 2));
    console.log(row.file, "completed", saved.elapsedMs, "ms");
  } else continue;
  rows.push({
    file: row.file,
    mode: row.mode,
    events: row.metadata.map((event: any) => ({
      ...event,
      fewShot: saved.body.answers.find((a: any) => a.id === event.id).drum,
    })),
  });
}
if (!request && rows.length !== 12) {
  console.log(
    "Inputs frozen; endpoint authorization pending. No API requests.",
  );
  process.exit(0);
}
const summaries = [];
for (const mode of ["all", "Fixed", "Personal"]) {
  const events = rows
      .filter((r) => mode === "all" || r.mode === mode)
      .flatMap((r) => r.events),
    matched = events.filter((e) => e.expected !== null);
  for (const pipeline of ["acoustic", "fewShot"]) {
    const correctCore = matched.filter(
        (e) => core(e[pipeline]) === core(e.expected),
      ).length,
      correctFour = matched.filter((e) => e[pipeline] === e.expected).length;
    summaries.push({
      mode,
      pipeline,
      sampled: events.length,
      matched: matched.length,
      unmatched: events.length - matched.length,
      correctCore,
      correctFour,
      conditionalCore: correctCore / matched.length,
      conditionalFour: correctFour / matched.length,
      perClass: labels.slice(0, 4).map((label) => {
        const subset = matched.filter((e) => e.expected === label);
        return {
          label,
          total: subset.length,
          correctCore: subset.filter((e) => core(e[pipeline]) === core(label))
            .length,
          correctFour: subset.filter((e) => e[pipeline] === label).length,
        };
      }),
    });
  }
}
const report = {
  protocol: prepared.protocol,
  preparedSha256: sha,
  examples: prepared.exampleMetadata,
  summaries,
  recordings: rows,
  limitation:
    "96deterministically sampled validation detections, not full transcription evaluation. Conditional metrics exclude unmatched sampled detections. No independent holdout claim, no new model fitting, no private audio, no app integration.",
};
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(summaries, null, 2));
