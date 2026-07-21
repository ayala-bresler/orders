# syntax=docker/dockerfile:1
#
# Railway / container — unified Node image (Vite client + Express API)
#
# Platform requirements this image meets:
#   - Listens on 0.0.0.0 and honors $PORT (Railway / Cloud Run inject PORT at runtime)
#   - HTTP only (TLS is terminated by the platform)
#   - Non-root user
#   - Ephemeral writes under /tmp
#   - SIGTERM handled by the Node process (see server/src/index.js)
#
# Build (from repo root):
#   docker build -t hetz-haim .
#
# Railway: connect the GitHub repo; it will build this Dockerfile automatically.
# Startup / health path: GET /api/health

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
# Stage 2 — production runtime
# -----------------------------------------------------------------------------
FROM node:20-bookworm-slim AS production

WORKDIR /app

# PORT default only — Railway overrides $PORT at runtime. Do not bake secrets.
ENV NODE_ENV=production \
    PORT=3000 \
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

# Non-root user + writable ephemeral dirs
RUN mkdir -p /tmp/saved/orders /app/fonts \
  && groupadd --system --gid 1001 app \
  && useradd --system --uid 1001 --gid app --home-dir /app --shell /usr/sbin/nologin app \
  && chown -R app:app /app /tmp/saved

USER app

# Document default port (runtime still uses process.env.PORT)
EXPOSE 3000

# Main entry — runs DB schema init, then starts the server (honors $PORT)
CMD ["node", "init.js"]
