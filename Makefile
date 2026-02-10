.PHONY: dev-ui dev-signal dev-all

dev-ui:
	npm run dev

dev-signal:
	npm --prefix server/signal run dev

dev-all:
	(sh -c 'npm run dev & npm --prefix server/signal run dev & wait')
