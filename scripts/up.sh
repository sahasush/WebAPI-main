#!/usr/bin/env bash
set -Eeuo pipefail

# Auto-pick a free HOST_PORT, verify Docker/Compose, bring up the stack, and tail logs.
# Usage: ./scripts/up.sh [preferred_port]

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
cd "$PROJECT_ROOT"

info() { printf "\033[1;34m[info]\033[0m %s\n" "$*"; }
success() { printf "\033[1;32m[ok]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[warn]\033[0m %s\n" "$*"; }
err() { printf "\033[1;31m[err]\033[0m %s\n" "$*"; }

# Ensure Docker is available
if ! command -v docker >/dev/null 2>&1; then
  err "Docker is not installed or not on PATH. Install Docker Desktop and try again."
  exit 127
fi

# Pick compose command (prefer v2)
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  err "Neither 'docker compose' nor 'docker-compose' found."
  exit 127
fi

# Check .env presence
if [[ ! -f .env ]]; then
  warn ".env not found; using defaults from .env.example where applicable."
fi

preferred_port="${1:-${HOST_PORT:-}}"

is_free_port() {
  local p="$1"
  # macOS: lsof available by default
  if lsof -i tcp:"$p" -sTCP:LISTEN -Pn >/dev/null 2>&1; then
    return 1
  fi
  return 0
}

pick_port() {
  local start=5000 end=5010
  if [[ -n "$preferred_port" ]]; then
    if is_free_port "$preferred_port"; then
      echo "$preferred_port"; return 0
    else
      warn "Preferred port $preferred_port is busy; picking another."
    fi
  fi
  for p in $(seq "$start" "$end"); do
    if is_free_port "$p"; then echo "$p"; return 0; fi
  done
  return 1
}

HOST_PORT_SELECTED="$(pick_port || true)"
if [[ -z "$HOST_PORT_SELECTED" ]]; then
  err "Could not find a free port between 5000-5010. Set HOST_PORT to a free port and retry."
  exit 1
fi

export HOST_PORT="$HOST_PORT_SELECTED"
info "Using HOST_PORT=$HOST_PORT"

# Build and start in detached mode so we can tail logs cleanly
"${COMPOSE[@]}" up --build -d
success "Stack is starting. Tailing logs (Ctrl-C to stop logs; services continue running)."

trap 'echo; info "Stopping log tail. Services remain running. Use: ${COMPOSE[*]} down"' INT TERM
"${COMPOSE[@]}" logs -f --tail=100 web db
