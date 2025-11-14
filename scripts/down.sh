#!/usr/bin/env bash
set -Eeuo pipefail

# Stop the Docker Compose stack and optionally clean volumes/images.
# Usage: ./scripts/down.sh [--clean]

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
cd "$PROJECT_ROOT"

info() { printf "\033[1;34m[info]\033[0m %s\n" "$*"; }
success() { printf "\033[1;32m[ok]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[warn]\033[0m %s\n" "$*"; }
err() { printf "\033[1;31m[err]\033[0m %s\n" "$*"; }

# Ensure Docker is available
if ! command -v docker >/dev/null 2>&1; then
  err "Docker is not installed or not on PATH."
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

CLEAN_MODE=false
if [[ "${1:-}" == "--clean" ]]; then
  CLEAN_MODE=true
fi

info "Stopping Docker Compose stack..."
"${COMPOSE[@]}" down

if [[ "$CLEAN_MODE" == "true" ]]; then
  warn "Clean mode: This will remove volumes (database data) and local images."
  read -p "Are you sure? [y/N]: " -r
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    info "Removing volumes..."
    "${COMPOSE[@]}" down -v
    
    info "Removing local images..."
    docker image rm eirvana-webapp:latest eirvana-db:latest 2>/dev/null || true
    
    info "Pruning unused Docker resources..."
    docker system prune -f
    
    success "Clean completed."
  else
    info "Clean canceled."
  fi
else
  success "Stack stopped. Database data preserved in volumes."
  info "To clean volumes/images, run: ./scripts/down.sh --clean"
fi