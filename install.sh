#!/bin/bash
set -e
FORGE_DIR="$(cd "$(dirname "$0")" && pwd)"
echo ""
echo "  N8N·FORGE v2 — Interface Chat + MCP"
echo "──────────────────────────────────────────────"

# Docker check
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

# .env
cd "$FORGE_DIR"
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "  ⚠ Édite .env avant de continuer :"
  echo "    GEMINI_API_KEY=..."
  echo "    MCP_AUTH_TOKEN=PfoLinking10!"
  echo ""
  read -rp "  Appuie sur Entrée après avoir édité .env..."
fi

# Build + start
docker compose down 2>/dev/null || true
docker compose build --no-cache
docker compose up -d

echo ""
echo "──────────────────────────────────────────────"
echo "  ✓ N8N·FORGE v2 démarré"
echo "  ✓ Local  : http://localhost:3001"
echo "  ✓ Public : https://forge.dinaou.com"
echo ""
echo "  docker compose logs -f   # logs"
echo "──────────────────────────────────────────────"
