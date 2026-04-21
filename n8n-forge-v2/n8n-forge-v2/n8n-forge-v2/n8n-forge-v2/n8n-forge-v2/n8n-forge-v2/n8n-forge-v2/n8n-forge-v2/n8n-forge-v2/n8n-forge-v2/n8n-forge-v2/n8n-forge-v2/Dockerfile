# ── Stage 1 : build frontend ─────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY client/ ./client/
RUN npm run build

# ── Stage 2 : production ──────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
# Pas de better-sqlite3 en v2 — on passe par MCP
RUN npm install --omit=dev
COPY server/ ./server/
COPY --from=builder /app/dist ./dist
RUN mkdir -p /app/data/sessions
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3001/api/health || exit 1
CMD ["node", "server/index.js"]
