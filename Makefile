.PHONY: install dev preview build test deploy secret audio-secret
install:
	npm ci
# Run make preview in another terminal for the TypeSafe API.
dev:
	npm run dev
preview: build
	npm run preview
build:
	npm run build
test:
	npm test
secret:
	npx wrangler secret put TYPESAFE_API_KEY
deploy:
	npm run deploy
# Add the audio-model key to a candidate version without changing the live app.
audio-secret:
	npx wrangler versions secret put GEMINI_API_KEY

# Train locally on Apple Silicon. Audio and checkpoints remain in ignored artifacts/.
ML_PYTHON ?= .venv-ml/bin/python
.PHONY: ml-install ml-prepare ml-train ml-train-expanded ml-train-voice ml-export ml-import
ml-install:
	python3 -m venv .venv-ml
	$(ML_PYTHON) -m pip install -r ml/requirements.txt
ml-prepare:
	npx tsx scripts/export-events.ts
	$(ML_PYTHON) ml/prepare.py
ml-train:
	$(ML_PYTHON) ml/train_transcriber.py
ml-train-expanded:
	npx tsx scripts/export-external-events.ts
	$(ML_PYTHON) ml/expand_corpus.py
	$(ML_PYTHON) ml/train_transcriber.py --manifest artifacts/expanded-events.json --classes hhc,hho,kd,sd,aux --name transcriber-expanded --augment --epochs 50
ml-train-voice:
	$(ML_PYTHON) ml/train_voice_metric.py
ml-export:
	$(ML_PYTHON) ml/export_browser.py
ml-import:
	$(ML_PYTHON) ml/import_training_pack.py "$(PACK)" --voice-id "$(VOICE)"
