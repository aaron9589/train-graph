# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

RUN npm install --workspace=client --workspace=server

# Copy source
COPY client/ ./client/
COPY server/ ./server/

# Build the React client
RUN npm run build --workspace=client

# ── Runtime stage ─────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Copy server source and install production deps only
COPY server/package.json ./server/
RUN npm install --prefix server --omit=dev

COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist

VOLUME ["/app/server/data"]

ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/app/server/data/train-graph.json

EXPOSE 3001

CMD ["node", "server/index.js"]
