# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# ─── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# ─── Builder ──────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client for the container's OS
RUN npx prisma generate

# Build Next.js (use --webpack to avoid Turbopack/native binding issues on some platforms)
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx next build --webpack

# ─── Runner ───────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PRISMA_HIDE_UPDATE_MESSAGE=1

# Create runtime user WITH home directory. npm/npx write their cache to
# $HOME/.npm; without /home/nextjs the first npx invocation fails with
# EACCES and the container enters a restart loop.
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid 1001 -m -d /home/nextjs nextjs

# Copy built app
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
# Prisma CLI (build/index.js) — required by docker-entrypoint.sh to run
# `prisma migrate deploy` offline. Without it, npx/npm try to download the
# CLI from the registry at container startup (slow, network-dependent, and
# the source of the EACCES crash since npm needs a writable HOME first).
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# Copy startup script
COPY --from=builder /app/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Liveness/readiness probe for the container orchestrator. The image ships
# Node, so probe the public health endpoint with node's fetch instead of
# adding curl to the runtime image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["./docker-entrypoint.sh"]
