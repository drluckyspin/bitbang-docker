# -----------------------------------------------------------------------------------------------------------
# Common Makefile — BitBang Docker
# -----------------------------------------------------------------------------------------------------------
# A hardened container around one local git repo, with a tmux shell in it served over BitBang.
#
# By convention (Code Red):
#  - targets that are called by the user
#    - are named 'target-name'
#    - have a .PHONY directive with a short "##" comment that describes the target
#  - "##" comments are automatically detected by the help target and displayed in the help message
#  - utility targets that are used by other targets
#    - are named 'target_name'
#    - are listed in .PHONY (no "##" comment — hidden from make help)
#
# Choosing a workspace: run and run-detached mount REPO=/path/to/repo, or the current directory when REPO
# is not given. The other targets take REPO too, and fall back to the only workspace when exactly one exists.
#
# Must stay compatible with GNU Make 3.81 (the macOS default): no .ONESHELL, no $(file ...).
# -----------------------------------------------------------------------------------------------------------

.DEFAULT_GOAL := help
MAKEFLAGS += --no-print-directory

PROJECT_NAME := BitBang Docker
SHELL := /bin/bash

COMMON_MAKEFILE_DIR := $(dir $(abspath $(firstword $(MAKEFILE_LIST))))
LOGGER := source $(COMMON_MAKEFILE_DIR)scripts/log.bash &&
CHECKENV_SCRIPT := $(COMMON_MAKEFILE_DIR)scripts/checkenv.bash
SCRIPTS_DIR := $(COMMON_MAKEFILE_DIR)scripts

IMAGE := bitbang-docker:latest
HOME_VOLUME := $(or $(BBD_HOME_VOLUME),bitbang-docker-home)
QR ?= true

DOCKER_COMPOSE := docker compose
COMPOSE := $(DOCKER_COMPOSE) --project-directory "$(COMMON_MAKEFILE_DIR)" -f "$(COMMON_MAKEFILE_DIR)docker-compose.yml"

# The agent user's uid/gid. Docker Desktop maps bind-mount ownership on its own, so 1000 is fine on
# macOS. On Linux the container must use the host uid to write to the mounted repo.
UNAME_S := $(shell uname -s)
STAT_MODE := $(if $(filter Darwin,$(UNAME_S)),stat -f '%Lp',stat -c '%a')

ifeq ($(UNAME_S),Darwin)
USER_UID := 1000
USER_GID := 1000
else
USER_UID := $(shell id -u)
USER_GID := $(shell id -g)
ifeq ($(USER_UID),0)
USER_UID := 1000
USER_GID := 1000
endif
endif

# -----------------------------------------------------------------------------------------------------------
# Workspace selection
#
# Each repo gets its own compose project, bbd-<repo directory name>. Its label bitbang-docker.repo
# records the mounted path, which is how targets find workspaces without REPO.
# -----------------------------------------------------------------------------------------------------------

REPO ?=

# run and run-detached mount the shell's current directory when REPO is not given. PWD, not CURDIR, so
# make -C <this dir> run still mounts the directory it was called from. Other targets keep an empty REPO,
# which means "the only workspace" (or every workspace, for down).
ifeq ($(strip $(REPO)),)
ifneq ($(filter run run-detached,$(MAKECMDGOALS)),)
REPO := $(or $(PWD),$(CURDIR))
endif
endif

REPO_EXPANDED := $(patsubst ~%,$(HOME)%,$(strip $(REPO)))
REPO_PATH := $(if $(REPO_EXPANDED),$(shell cd "$(REPO_EXPANDED)" 2>/dev/null && pwd -P))

bbd_project = bbd-$(shell printf '%s' "$$(basename "$(1)")" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_-' '-')

# Recursive on purpose: docker is only asked when a target actually needs the list.
WORKSPACE_PROJECTS = $(shell docker ps -a --filter label=bitbang-docker.repo \
	--format '{{.Label "com.docker.compose.project"}}' 2>/dev/null | sort -u)

ifneq ($(REPO_EXPANDED),)
PROJECT := $(call bbd_project,$(or $(REPO_PATH),$(REPO_EXPANDED)))
else
PROJECT = $(if $(filter 1,$(words $(WORKSPACE_PROJECTS))),$(WORKSPACE_PROJECTS))
endif

CONTAINER_ID = $(shell docker ps -aq --filter label=com.docker.compose.project=$(PROJECT) \
	--filter label=com.docker.compose.service=workspace 2>/dev/null | head -n 1)

# -----------------------------------------------------------------------------------------------------------
# Help (default target)
#
# This will display any PHONY target in the Makefile that has a comment that
# starts with '##'.
# -----------------------------------------------------------------------------------------------------------

.PHONY: help build check run run-detached url attach ping logs down clean clean-home test lint format format-check
.PHONY: check_docker check_env check_env_perms check_repo check_image require_project export_ca
.PHONY: check_dprint check_shfmt check_mbake check_shellcheck check_formatters

.PHONY: help ## Show this help message
help:
	@$(LOGGER) log_banner
	@$(LOGGER) log_info "Available make targets ($(PROJECT_NAME)):"
	@echo ""
	@grep -E \
		'^.PHONY: .*?## .*$$' $(MAKEFILE_LIST) | \
		sort | \
		awk 'BEGIN {FS = ".PHONY: |## "}; {printf "  %-22s - %s\n", $$2, $$3}'
	@echo ""
	@$(LOGGER) log_info "Quick start"
	@$(LOGGER) log_dim "make build && make run REPO=~/src/my-repo"

# -----------------------------------------------------------------------------------------------------------
# Check environment and tools targets
# -----------------------------------------------------------------------------------------------------------

# Check Docker, the daemon and Compose v2 are available
check_docker:
	@if ! command -v docker >/dev/null 2>&1; then \
		$(LOGGER) log_error "Docker is not installed."; \
		exit 1; \
	fi
	@if ! docker info >/dev/null 2>&1; then \
		$(LOGGER) log_error "The Docker daemon is not running. Start Docker Desktop (or dockerd) and retry."; \
		exit 1; \
	fi
	@if ! docker compose version >/dev/null 2>&1; then \
		$(LOGGER) log_error "Docker Compose v2 ('docker compose') is required."; \
		exit 1; \
	fi
	@$(LOGGER) log_info_dim "docker $$(docker version -f '{{.Server.Version}}') and compose $$(docker compose version --short) are available."

# Create .env from .env.example if needed (owner-only), and check every key has a value
check_env:
	@cd "$(COMMON_MAKEFILE_DIR)"; \
	created=0; \
	[ -f .env ] || created=1; \
	$(CHECKENV_SCRIPT) .env && { [ "$$created" = 0 ] || chmod 600 .env; }

# .env holds API keys and a GitHub token, so it should be readable by its owner only
check_env_perms:
	@cd "$(COMMON_MAKEFILE_DIR)"; \
	[ -f .env ] || exit 0; \
	perms=$$($(STAT_MODE) .env); \
	case "$$perms" in \
		*00) $(LOGGER) log_info_dim ".env is private (mode $$perms)." ;; \
		*) $(LOGGER) log_warning ".env is readable by other users (mode $$perms). Fix with: chmod 600 .env" ;; \
	esac

# Check REPO is a single, mountable repository that no other workspace is using
check_repo:
	@if [ -z "$(REPO_EXPANDED)" ]; then \
		$(LOGGER) log_error "Pass the repo to mount, e.g. make run REPO=~/src/my-repo"; \
		exit 1; \
	fi
	@if [ -z "$(REPO_PATH)" ]; then \
		$(LOGGER) log_error "REPO is not a directory: $(REPO)"; \
		exit 1; \
	fi
	@if [ "$(REPO_PATH)" = "/" ] || [ "$(REPO_PATH)" = "$$(cd "$$HOME" && pwd -P)" ]; then \
		$(LOGGER) log_error "Refusing to mount $(REPO_PATH); point REPO at a single repository."; \
		exit 1; \
	fi
	@if [ -f "$(REPO_PATH)/.git" ]; then \
		$(LOGGER) log_error "$(REPO_PATH) is a git worktree or submodule. Its .git points outside the mount, so mount the main checkout instead."; \
		exit 1; \
	fi
	@if [ ! -d "$(REPO_PATH)/.git" ]; then \
		$(LOGGER) log_warning "$(REPO_PATH) is not a git repository; mounting it anyway."; \
	fi
	@existing=$$(docker ps -a --filter label=com.docker.compose.project=$(PROJECT) --format '{{.Label "bitbang-docker.repo"}}' | head -n 1); \
	if [ -n "$$existing" ] && [ "$$existing" != "$(REPO_PATH)" ]; then \
		$(LOGGER) log_error "$(PROJECT) already serves $$existing. Stop it first: make down REPO=$$existing"; \
		exit 1; \
	fi

# Check the image has been built
check_image:
	@if ! docker image inspect $(IMAGE) >/dev/null 2>&1; then \
		$(LOGGER) log_error "Image $(IMAGE) not found. Build it with: make build"; \
		exit 1; \
	fi

# Resolve PROJECT, or explain why it cannot be resolved
require_project: check_docker
	@if [ -z "$(PROJECT)" ]; then \
		if [ -z "$(WORKSPACE_PROJECTS)" ]; then \
			$(LOGGER) log_error "No workspace exists. Start one with: make run REPO=~/src/my-repo"; \
		else \
			$(LOGGER) log_error "Several workspaces exist; choose one with REPO=/path/to/repo (see make ping)."; \
		fi; \
		exit 1; \
	fi
	@if [ -z "$(CONTAINER_ID)" ]; then \
		$(LOGGER) log_error "No workspace for $(PROJECT). Start one with: make run REPO=$(or $(REPO_PATH),$(REPO))"; \
		exit 1; \
	fi

.PHONY: check ## Verify Docker, .env and its permissions
check:
	@$(LOGGER) log_separator
	@$(LOGGER) log_info "Checking dependencies"
	@$(MAKE) check_docker
	@$(MAKE) check_env
	@$(MAKE) check_env_perms
	@$(LOGGER) log_success "Check complete"

# -----------------------------------------------------------------------------------------------------------
# Build
# -----------------------------------------------------------------------------------------------------------

# Export a Zscaler root CA into certs/ when the host has one
export_ca:
	@$(SCRIPTS_DIR)/export-ca.bash

.PHONY: build ## Build the bitbang-docker image (trusts a Zscaler root CA when the host has one)
build: check_docker export_ca
	@$(LOGGER) log_separator
	@$(LOGGER) log_info "Building $(IMAGE) (agent uid $(USER_UID), gid $(USER_GID))"
	@docker build \
		--build-arg USER_UID=$(USER_UID) \
		--build-arg USER_GID=$(USER_GID) \
		-t $(IMAGE) \
		"$(COMMON_MAKEFILE_DIR)"
	@$(LOGGER) log_success "Built $(IMAGE)"

# -----------------------------------------------------------------------------------------------------------
# Run targets
# -----------------------------------------------------------------------------------------------------------

.PHONY: run-detached ## Start a workspace for REPO and print its QR code and URL (QR=false prints the URL only)
run-detached: check check_repo check_image
	@$(LOGGER) log_separator
	@$(LOGGER) log_info "Starting $(PROJECT) for $(REPO_PATH)"
	@BBD_REPO="$(REPO_PATH)" \
	GIT_AUTHOR_NAME="$$(git -C "$(REPO_PATH)" config user.name 2>/dev/null)" \
	GIT_AUTHOR_EMAIL="$$(git -C "$(REPO_PATH)" config user.email 2>/dev/null)" \
	GIT_COMMITTER_NAME="$$(git -C "$(REPO_PATH)" config user.name 2>/dev/null)" \
	GIT_COMMITTER_EMAIL="$$(git -C "$(REPO_PATH)" config user.email 2>/dev/null)" \
	$(COMPOSE) -p $(PROJECT) up -d
	@QR=$(QR) $(SCRIPTS_DIR)/bitbang-url.bash $(PROJECT)
	@$(LOGGER) log_info_dim "Local shell: make attach REPO=$(REPO_PATH)   Stop: make down REPO=$(REPO_PATH)"

.PHONY: run ## Start a workspace for REPO, print its QR code, then follow its logs until Ctrl+C stops it
run: run-detached
	@$(LOGGER) log_separator
	@$(LOGGER) log_info_dim "Following logs. Ctrl+C stops the workspace (make run-detached leaves it running)."
	@trap '$(MAKE) down REPO="$(REPO_PATH)"' EXIT; \
	trap 'exit 130' INT TERM; \
	docker logs -f --tail 0 "$(CONTAINER_ID)"

.PHONY: url ## Print the QR code and URL of a workspace (QR=false prints the URL only)
url: require_project
	@QR=$(QR) $(SCRIPTS_DIR)/bitbang-url.bash $(PROJECT)

.PHONY: attach ## Open the workspace's tmux session in this terminal
attach: require_project
	@docker exec -it "$(CONTAINER_ID)" bitbang-docker-session

.PHONY: logs ## Follow a workspace's logs (they include its URL)
logs: require_project
	@docker logs -f "$(CONTAINER_ID)"

.PHONY: ping ## List workspaces with their repo and BitBang listener health
ping: check_docker
	@$(LOGGER) log_separator
	@$(LOGGER) log_info "$(PROJECT_NAME) workspaces"
	@ids=$$(docker ps -aq --filter label=bitbang-docker.repo); \
	if [ -z "$$ids" ]; then \
		$(LOGGER) log_info_dim "None. Start one with: make run REPO=~/src/my-repo"; \
		exit 0; \
	fi; \
	docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "bitbang-docker.repo"}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}' $$ids | \
	while IFS='|' read -r project repo state health; do \
		echo ""; \
		$(LOGGER) log "$$project"; \
		$(LOGGER) log_indent log_dim "$$repo"; \
		case "$$state/$$health" in \
			running/healthy) $(LOGGER) log_indent log_success "Running; BitBang listener is registered" ;; \
			running/starting) $(LOGGER) log_indent log_warning "Starting" ;; \
			running/*) $(LOGGER) log_indent log_error "Running, but the listener failed its last check (the watchdog restarts it)" ;; \
			*) $(LOGGER) log_indent log_error "Not running ($$state). See make logs REPO=$$repo" ;; \
		esac; \
	done

.PHONY: down ## Stop REPO's workspace, or every workspace when REPO is not given (keeps the home volume)
down: check_docker
	@projects="$(if $(REPO_EXPANDED),$(PROJECT),$(WORKSPACE_PROJECTS))"; \
	if [ -z "$$projects" ]; then \
		$(LOGGER) log_info_dim "No workspaces to stop."; \
		exit 0; \
	fi; \
	for project in $$projects; do \
		repo=$$(docker ps -a --filter label=com.docker.compose.project=$$project --format '{{.Label "bitbang-docker.repo"}}' | head -n 1); \
		$(LOGGER) log_info "Stopping $$project"; \
		BBD_REPO="$${repo:-/nonexistent}" $(COMPOSE) -p "$$project" down --remove-orphans; \
	done

# -----------------------------------------------------------------------------------------------------------
# Clean targets
# -----------------------------------------------------------------------------------------------------------

.PHONY: clean ## Stop every workspace; remove the image, exported CAs and .env backups (keeps logins)
clean: check_docker
	@$(LOGGER) log_separator
	@$(LOGGER) log_info "Cleaning $(PROJECT_NAME) resources"
	@$(MAKE) down REPO=
	@$(LOGGER) log_indent log_dim "Removing image $(IMAGE)..."
	@docker image rm $(IMAGE) >/dev/null 2>&1 || true
	@$(LOGGER) log_indent log_dim "Removing exported CAs and .env backup files..."
	@rm -f "$(COMMON_MAKEFILE_DIR)"certs/*.crt "$(COMMON_MAKEFILE_DIR).env.bak" "$(COMMON_MAKEFILE_DIR).env.new"
	@$(LOGGER) log_success "Clean complete. Logins and shell history stay in the $(HOME_VOLUME) volume (make clean-home removes them)."

.PHONY: clean-home ## Delete the home volume with agent logins, shell history and git config (asks first)
clean-home: check_docker
	@if ! docker volume inspect $(HOME_VOLUME) >/dev/null 2>&1; then \
		$(LOGGER) log_info_dim "Volume $(HOME_VOLUME) does not exist."; \
		exit 0; \
	fi; \
	if [ -n "$$(docker ps -aq --filter volume=$(HOME_VOLUME))" ]; then \
		$(LOGGER) log_error "Volume $(HOME_VOLUME) is in use. Stop the workspaces first: make down"; \
		exit 1; \
	fi; \
	read -r -p "Delete $(HOME_VOLUME), including agent logins and shell history? [y/N] " answer; \
	case "$$answer" in \
		[yY]) docker volume rm $(HOME_VOLUME) >/dev/null && $(LOGGER) log_success "Deleted $(HOME_VOLUME)" ;; \
		*) $(LOGGER) log_info_dim "Kept $(HOME_VOLUME)" ;; \
	esac

# -----------------------------------------------------------------------------------------------------------
# Test targets
# -----------------------------------------------------------------------------------------------------------

.PHONY: test ## Smoke-test the image in a throwaway container (needs make build; never touches .env)
test: check_docker check_image
	@USER_UID=$(USER_UID) USER_GID=$(USER_GID) $(SCRIPTS_DIR)/smoke-test.bash

# -----------------------------------------------------------------------------------------------------------
# Lint and format targets
# -----------------------------------------------------------------------------------------------------------

# Check dprint is installed
check_dprint:
	@if ! dprint --version >/dev/null 2>&1; then \
		$(LOGGER) log_error "dprint is not installed. Run: brew install dprint"; \
		exit 1; \
	else \
		$(LOGGER) log_info_dim "$$(dprint --version) is installed."; \
	fi

# Check shfmt is installed
check_shfmt:
	@if ! shfmt --version >/dev/null 2>&1; then \
		$(LOGGER) log_error "shfmt is not installed. Run: brew install shfmt"; \
		exit 1; \
	else \
		$(LOGGER) log_info_dim "shfmt $$(shfmt --version) is installed."; \
	fi

# Check mbake is installed
check_mbake:
	@if ! mbake --version >/dev/null 2>&1; then \
		$(LOGGER) log_error "mbake is not installed. Run: uv tool install mbake"; \
		exit 1; \
	else \
		$(LOGGER) log_info_dim "$$(mbake --version) is installed."; \
	fi

# Check shellcheck is installed
check_shellcheck:
	@if ! shellcheck --version >/dev/null 2>&1; then \
		$(LOGGER) log_error "shellcheck is not installed. Run: brew install shellcheck"; \
		exit 1; \
	else \
		$(LOGGER) log_info_dim "shellcheck $$(shellcheck --version | awk '/^version:/ {print $$2}') is installed."; \
	fi

# Check dprint and its Exec-plugin formatter dependencies
check_formatters:
	@$(MAKE) check_dprint
	@$(MAKE) check_shfmt
	@$(MAKE) check_mbake

.PHONY: format ## Format all supported files
format:
	@$(LOGGER) log_separator
	@$(LOGGER) log_info "Checking formatting dependencies"
	@$(MAKE) check_formatters
	@$(LOGGER) log_separator
	@FORMAT_FILE_COUNT=$$(cd "$(COMMON_MAKEFILE_DIR)" && dprint file-paths --config dprint.json | wc -l | tr -d '[:space:]'); \
	$(LOGGER) log_info "Formatting files with dprint ($$FORMAT_FILE_COUNT files)"
	@cd "$(COMMON_MAKEFILE_DIR)" && dprint fmt --config dprint.json --incremental=false

.PHONY: format-check ## Verify formatting without modifying files
format-check:
	@$(LOGGER) log_separator
	@$(LOGGER) log_info "Checking formatting dependencies"
	@$(MAKE) check_formatters
	@$(LOGGER) log_separator
	@FORMAT_FILE_COUNT=$$(cd "$(COMMON_MAKEFILE_DIR)" && dprint file-paths --config dprint.json | wc -l | tr -d '[:space:]'); \
	$(LOGGER) log_info "Checking formatting with dprint ($$FORMAT_FILE_COUNT files)"
	@cd "$(COMMON_MAKEFILE_DIR)" && dprint check --config dprint.json --incremental=false

.PHONY: lint ## Check formatting, run shellcheck, and validate docker-compose.yml
lint: format-check
	@echo ""
	@$(LOGGER) log_info "Running linters"
	@$(MAKE) check_shellcheck
	@cd "$(COMMON_MAKEFILE_DIR)" && shellcheck -x -S warning scripts/*.bash docker/*.bash
	@$(LOGGER) log_indent log_success "shellcheck passed"
	@BBD_REPO=/tmp $(COMPOSE) --env-file "$(COMMON_MAKEFILE_DIR).env.example" config -q
	@$(LOGGER) log_indent log_success "docker-compose.yml is valid"
	@$(LOGGER) log_success "All checks passed"