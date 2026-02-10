.PHONY: dev-ui dev-signal dev-all build-ui bundle-ui-for-go build-signal-go build-portable build-portable-all run-portable

SIGNAL_GO_DIR := server/signal-go
SIGNAL_GO_WEB_DIR := $(SIGNAL_GO_DIR)/web
PORTABLE_BIN := dist/scorched-signal-go
PORTABLE_BIN_LOCAL := $(SIGNAL_GO_DIR)/scorched-signal-go
PORTABLE_DIR := dist/portable

dev-ui:
	npm run dev

dev-signal:
	npm --prefix server/signal run dev

dev-all:
	(sh -c 'npm run dev & npm --prefix server/signal run dev & wait')

build-ui:
	npm run build

bundle-ui-for-go: build-ui
	rm -rf $(SIGNAL_GO_WEB_DIR)/*
	cp -R dist/. $(SIGNAL_GO_WEB_DIR)/

build-signal-go: bundle-ui-for-go
	GOCACHE=/tmp/go-build-cache go build -C $(SIGNAL_GO_DIR) -o ../../$(PORTABLE_BIN) .
	cp $(PORTABLE_BIN) $(PORTABLE_BIN_LOCAL)

build-portable: build-signal-go

build-portable-all: bundle-ui-for-go
	mkdir -p $(PORTABLE_DIR)
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 GOCACHE=/tmp/go-build-cache go build -C $(SIGNAL_GO_DIR) -o ../../$(PORTABLE_DIR)/scorched-signal-go-windows-amd64.exe .
	CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 GOCACHE=/tmp/go-build-cache go build -C $(SIGNAL_GO_DIR) -o ../../$(PORTABLE_DIR)/scorched-signal-go-darwin-amd64 .
	CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 GOCACHE=/tmp/go-build-cache go build -C $(SIGNAL_GO_DIR) -o ../../$(PORTABLE_DIR)/scorched-signal-go-darwin-arm64 .
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOCACHE=/tmp/go-build-cache go build -C $(SIGNAL_GO_DIR) -o ../../$(PORTABLE_DIR)/scorched-signal-go-linux-amd64 .
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 GOCACHE=/tmp/go-build-cache go build -C $(SIGNAL_GO_DIR) -o ../../$(PORTABLE_DIR)/scorched-signal-go-linux-arm64 .

run-portable: build-portable
	./$(PORTABLE_BIN)
