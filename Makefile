.PHONY: install dev preview build test deploy secret
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
