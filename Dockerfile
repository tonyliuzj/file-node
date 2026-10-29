# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps

WORKDIR /app

ARG NPM_VERSION=11.6.2

ENV NEXT_TELEMETRY_DISABLED=1

# Build tools are only a fallback for better-sqlite3 when no prebuilt binary matches the platform.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    python3 \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g "npm@${NPM_VERSION}"

# vendor/ holds the empty stand-in that package.json's "overrides" installs in place of pdfjs-dist's
# optional native canvas module, so it has to exist before `npm ci` runs.
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci

FROM node:22-bookworm-slim AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  HOSTNAME=0.0.0.0 \
  PORT=3000 \
  DATABASE_URL=/app/data/data.db

RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/data \
  && chown -R node:node /app/data

COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/.next/standalone ./
# Account recovery tool: docker compose exec -u node file-node node scripts/reset-admin.mjs
# Next bundles bcryptjs into the server chunks instead of shipping it, so the script gets its own
# copy (a pure JavaScript package with no dependencies).
COPY --from=builder --chown=node:node /app/scripts ./scripts
COPY --from=builder --chown=node:node /app/node_modules/bcryptjs ./node_modules/bcryptjs

EXPOSE 3000
VOLUME ["/app/data"]

# Starts as root only so the entrypoint can fix /app/data ownership, then runs the app as `node`.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
