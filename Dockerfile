# syntax=docker/dockerfile:1
FROM node:22-slim AS build
WORKDIR /app
# package-lock.json is committed (see .gitignore note) — `npm ci` gives a
# deterministic, reproducible install from the lockfile rather than resolving
# the range each build.
COPY package*.json ./
RUN npm ci
# .env.production is committed and contains every VITE_* URL this SPA needs --
# it's copied into the build context and read by `vite build --mode production`.
COPY . .

# Vite bakes VITE_* vars into the static bundle at build time -- there is no
# runtime env step for a static SPA. `--mode production` makes Vite read
# .env.production (which contains all the production backend URLs, including
# VITE_AI_COPILOT_API_URL). Do NOT set ENV VITE_*=... here: process
# environment variables take precedence over .env files in Vite, so an empty
# ENV would blank out the real URLs from .env.production.
#
# The package build script runs the TypeScript gate before bundling. Keep the
# image build on the exact same release path as CI so an image can never ship
# code that CI would reject.
RUN npm run build

FROM node:22-slim
WORKDIR /app
# Pin the runtime server so the image is reproducible and never resolves a
# package when Cloud Run starts it.
RUN npm install --global --no-audit --no-fund serve@14.2.4
COPY --from=build /app/dist ./dist
# Run as an unprivileged user — the container only serves static files, so it
# never needs root. This is a production hardening step, not cosmetic.
RUN useradd -r -u 10001 -g node appuser && chown -R appuser:node /app
USER appuser
EXPOSE 8080
# -s = SPA mode (rewrite all unmatched paths to index.html, matching the
# original wrangler.jsonc's not_found_handling: single-page-application)
CMD ["sh", "-c", "serve -s dist -l ${PORT:-8080}"]
