import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, ".."),
  out = resolve(root, "artifacts/blind-reference");
const source = resolve(root, "artifacts/new-public-audio/freesound-740030.mp3");
const audio = readFileSync(source),
  hash = createHash("sha256").update(audio).digest("hex");
const expected =
  "4aea162754fccae8f049da5b3c37f2ec8044f5d9baee2307f95324013816b090";
if (hash !== expected)
  throw new Error(
    "Source audio hash mismatch. Refusing to substitute another recording.",
  );
mkdirSync(out, { recursive: true });
copyFileSync(source, resolve(out, "recording-001.mp3"));
const font = readFileSync(
  resolve(
    root,
    "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2",
  ),
).toString("base64");
const fontBold = readFileSync(
  resolve(
    root,
    "node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2",
  ),
).toString("base64");
let template = readFileSync(
  resolve(root, "scripts/blind-reference-template.html"),
  "utf8",
);
template = template
  .replace("__FONT_REGULAR__", font)
  .replace("__FONT_SEMIBOLD__", fontBold)
  .replace(
    "__RECORDING_DATA__",
    JSON.stringify({
      recordingId: "recording-001",
      audioSha256: hash,
      audioBase64: audio.toString("base64"),
    }).replaceAll("<", "\\u003c"),
  );
writeFileSync(resolve(out, "index.html"), template);
writeFileSync(
  resolve(out, "manifest.json"),
  JSON.stringify(
    {
      version: 1,
      recordingId: "recording-001",
      audioFile: "recording-001.mp3",
      audioSha256: hash,
      source: {
        provider: "Freesound",
        title: "G Beat Box boots n cats",
        creator: "itinerantmonk108",
        license: "CC0-1.0",
        id: 740030,
        url: "https://freesound.org/s/740030/",
        localSource: "artifacts/new-public-audio/freesound-740030.mp3",
      },
      developmentExposed: true,
      annotationStatus:
        "No annotations supplied. Reviewer must listen and label independently.",
      modelBlindness:
        "Review UI contains no predictions, reference labels, expected phrases, or automatic onset detection.",
      brandSource:
        "src/style.css; Inter, cream #f5f5ef, ink #242b26, sage #b6c4a0",
      review:
        "Open index.html locally. Audio and fonts are embedded so no server or network is required.",
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({ output: out, audioSha256: hash, sourceBytes: audio.length }),
);
