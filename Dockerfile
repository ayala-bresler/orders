# syntax=docker/dockerfile:1
#
# Google Cloud Run — unified Node image (Vite client + Express API)
#
# Cloud Run requirements this image meets:
#   - Listens on 0.0.0.0 and honors $PORT (Cloud Run injects PORT, usually 8080)
#   - HTTP only (TLS is terminated by Cloud Run)
#   - Non-root user
#   - Ephemeral writes under /tmp (Cloud Run filesystem is not durable)
#   - SIGTERM handled by the Node process (see server/src/index.js)
#
# Build (from repo root):
#   docker build -t REGION-docker.pkg.dev/PROJECT/REPO/hetz-haim:latest .
#
# Deploy example:
#   gcloud run deploy hetz-haim \
#     --image REGION-docker.pkg.dev/PROJECT/REPO/hetz-haim:latest \
#     --region REGION \
#     --platform managed \
#     --allow-unauthenticated \
#     --port 8080 \
#     --set-env-vars "NODE_ENV=production,PGHOST=...,PGDATABASE=..." \
#     --set-secrets "PGPASSWORD=..."
#
# Startup / liveness probe path: GET /api/health

# -----------------------------------------------------------------------------
# Stage 1 — build the React client
# -----------------------------------------------------------------------------
FROM node:20-bookworm-slim AS client-build

WORKDIR /build/client

COPY client/package.json client/package-lock.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2 — production runtime for Cloud Run
# -----------------------------------------------------------------------------
FROM node:20-bookworm-slim AS production

WORKDIR /app

# PORT is a default only — Cloud Run overrides it at runtime. Do not bake secrets.
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    STATIC_DIR=/app/public \
    STORAGE_DIR=/tmp/saved/orders \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# Install production dependencies only
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force

# Application source (templates, fonts placeholders, routes, …)
COPY server/ ./

# Never ship local secrets into the image
RUN rm -f .env .env.local .env.*.local

# Client build → static folder Express serves
COPY --from=client-build /build/client/dist/ ./public/

# Non-root user (Cloud Run-compatible) + writable ephemeral dirs
RUN mkdir -p /tmp/saved/orders /app/fonts \
  && groupadd --system --gid 1001 app \
  && useradd --system --uid 1001 --gid app --home-dir /app --shell /usr/sbin/nologin app \
  && chown -R app:app /app /tmp/saved

USER app

# Cloud Run default container port (runtime still uses $PORT)
EXPOSE 8080

# Main entry: server/package.json → "main": "src/index.js"
CMD ["node", "src/index.js"]
