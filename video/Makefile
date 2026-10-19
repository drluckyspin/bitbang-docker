# -----------------------------------------------------------------------------------------------------------
# go-remote teaser — Makefile
# -----------------------------------------------------------------------------------------------------------
# Previews and renders the Remotion teaser, and turns it into the README's GIF. Run it from video/.
#
#   make studio              — preview in Remotion Studio, which reloads as you edit src/
#   make still FRAME=809     — render one frame to out/still-809.png
#   make render              — render out/go-remote-teaser.mp4
#   make gif                 — make ../docs/go-remote-teaser.gif, rendering the video first if it is stale
#
# Must stay compatible with GNU Make 3.81 (the macOS default): no .ONESHELL, no $(file ...).
# -----------------------------------------------------------------------------------------------------------

.DEFAULT_GOAL := help
MAKEFLAGS += --no-print-directory
SHELL := /bin/bash

VIDEO_DIR := $(dir $(abspath $(firstword $(MAKEFILE_LIST))))
LOGGER := source $(VIDEO_DIR)../scripts/log.bash &&

VIDEO := out/go-remote-teaser.mp4
GIF := ../docs/go-remote-teaser.gif
PALETTE := out/gif-palette.png
FRAME ?= 809

# Everything a render reads. The synthesized audio is left out: scripts/make-audio.mjs makes it on every render.
SOURCES := $(shell find src scripts public/brand public/audio/sfx -type f 2>/dev/null) package.json remotion.config.ts

# cursor-approve's two-pass recipe: a palette, then a bayer-dithered GIF that uses it. The denoise and the 128
# colours nearly halve the file here, because the camera never stops moving, so almost every pixel changes on
# every frame; GIF_COLORS=256 smooths the banding in the dark backdrop for about a quarter more. GIF_START and
# GIF_LENGTH, in seconds, cut a segment.
GIF_WIDTH ?= 800
GIF_FPS ?= 12
GIF_COLORS ?= 128
GIF_START ?=
GIF_LENGTH ?=
GIF_TRIM = $(if $(GIF_START),-ss $(GIF_START)) $(if $(GIF_LENGTH),-t $(GIF_LENGTH))
GIF_FILTERS = fps=$(GIF_FPS),scale=$(GIF_WIDTH):-1:flags=lanczos,hqdn3d=4:3:6:4

.PHONY: help install studio still render poster gif lint check_ffmpeg

.PHONY: help ## Show this help message
help:
	@$(LOGGER) log_info "Available make targets (go-remote teaser):"
	@echo ""
	@grep -E '^.PHONY: .*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ".PHONY: |## "}; {printf "  %-9s - %s\n", $$2, $$3}'
	@echo ""
	@$(LOGGER) log_info "Workflow"
	@$(LOGGER) log_dim "make studio, edit src/ and watch it reload; then make render, or make gif for the README"

.PHONY: install ## Install the dependencies; the other targets do this the first time
install:
	@$(LOGGER) log_info "Installing the dependencies"
	@npm install

node_modules:
	@$(MAKE) install

.PHONY: studio ## Preview in Remotion Studio, which reloads as you edit src/
studio: | node_modules
	@npm run dev

.PHONY: still ## Render one frame of the teaser to out/still-FRAME.png (FRAME=809, the poster, by default)
still: | node_modules
	@npm run --silent audio
	@npx remotion still GoRemoteTeaser out/still-$(FRAME).png --frame=$(FRAME)
	@$(LOGGER) log_success "Wrote out/still-$(FRAME).png"

$(VIDEO): $(SOURCES) | node_modules
	@npm run render

.PHONY: render ## Render out/go-remote-teaser.mp4, 1920 by 1080 at 30 fps
render: | node_modules
	@npm run render
	@$(LOGGER) log_success "Wrote $(VIDEO)"
	@$(LOGGER) log_dim "QuickTime keeps playing a copy it already has open: close its window before opening this one."

.PHONY: poster ## Render the thumbnail, out/go-remote-poster.jpg
poster: | node_modules
	@npm run poster

.PHONY: gif ## Make ../docs/go-remote-teaser.gif for the README (GIF_WIDTH, GIF_FPS, GIF_COLORS, GIF_START, GIF_LENGTH)
gif: check_ffmpeg $(VIDEO)
	@$(LOGGER) log_info "Making $(GIF), $(GIF_WIDTH) px wide at $(GIF_FPS) fps"
	@ffmpeg -y -loglevel error $(GIF_TRIM) -i $(VIDEO) \
		-vf "$(GIF_FILTERS),palettegen=max_colors=$(GIF_COLORS):stats_mode=diff" $(PALETTE)
	@ffmpeg -y -loglevel error $(GIF_TRIM) -i $(VIDEO) -i $(PALETTE) \
		-lavfi "$(GIF_FILTERS)[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" -loop 0 $(GIF)
	@$(LOGGER) log_success "Wrote $(GIF), $$(du -h $(GIF) | cut -f1 | tr -d ' ')"

.PHONY: lint ## ESLint and tsc
lint: | node_modules
	@npm run lint

check_ffmpeg:
	@if ! command -v ffmpeg >/dev/null 2>&1; then \
		$(LOGGER) log_error "ffmpeg is not installed. Run: brew install ffmpeg"; \
		exit 1; \
	fi
