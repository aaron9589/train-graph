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

# Create a non-root user to run the application
# su-exec is used by the entrypoint to drop privileges after chowning the volume
RUN addgroup -S app && adduser -S app -G app && apk add --no-cache su-exec

# Copy server source and install production deps only
COPY server/package.json ./server/
RUN npm install --prefix server --omit=dev

COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist
COPY server/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Ensure the data directory exists and is owned by the app user before
# VOLUME is declared so the initial volume state has correct ownership.
RUN mkdir -p /app/server/data && chown -R app:app /app

VOLUME ["/app/server/data"]

ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/app/server/data/train-graph.json

EXPOSE 3001

# Entrypoint runs as root, chowns the data volume, then drops to app user
ENTRYPOINT ["/docker-entrypoint.sh"]
