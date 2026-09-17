# Recording labeled examples

Open `/teach` to record examples of all seven kit sounds. This is a data-collection page, not a claim that the classifier is ready.

1. Choose a drum and record five spaced examples in your usual voice.
2. Record a separate second take. It is marked **holdout**, so it can be kept out of fitting and tuning.
3. Repeat for the other sounds. Partial packs can also be downloaded.
4. Download the training pack. Sharing the downloaded file is a separate, explicit action.

Audio stays in IndexedDB in the current browser. The page sends no recording uploads. Recordings survive a reload; clearing browser site data removes them. The JSON download contains the audio, selected drum labels, take roles, and recording dates. Do not publish a person's training pack without their permission.

Labels apply to each recording. Individual onset times have **not** been human-annotated, so this pack alone is not an end-to-end transcription benchmark. Separate groove recordings and onset review are still needed to establish performance in actual use. A second take from the same person also does not measure generalization to new performers.

## Interface validation

The page reuses the existing Inter typography, sage/neutral tokens in `src/style.css`, and Lucide icons. No new brand assets were introduced. Native buttons, visible keyboard focus, recording status announcements, disabled switching during recording, and a microphone-denied state are provided.

`scripts/training-capture-check.mjs` checks recording, training/holdout roles, download, persistence, no upload requests, microphone denial, and layouts at 390, 768, 1440, and 1920 pixels. Screenshots are saved under the ignored `artifacts/ml-v2` directory.
