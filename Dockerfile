# Vouch monorepo — API server (default) or worker (override CMD)
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++ openssl
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/dashboard/package.json ./apps/dashboard/
COPY packages/config/package.json ./packages/config/
COPY packages/core/package.json ./packages/core/
COPY packages/types/package.json ./packages/types/
# Copy the schema before install: the root `postinstall` runs `prisma generate`,
# which needs prisma/schema.prisma to exist during `pnpm install`.
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile

COPY apps/api ./apps/api
COPY packages ./packages

RUN pnpm exec prisma generate --schema=prisma/schema.prisma
RUN pnpm run build --filter=@vouch/types --filter=@vouch/config --filter=@vouch/core --filter=@vouch/api

FROM node:20-alpine AS production

RUN apk add --no-cache dumb-init openssl

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=nodejs:nodejs /app/packages ./packages
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json

USER nodejs

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
# Default command = all-in-one (webhook server + worker in one process) — the
# free single-service deploy shape. Runs `prisma migrate deploy` first; it takes
# a Postgres advisory lock, so it is safe even when run concurrently.
# For split deployments override CMD with apps/api/dist/server.js or worker.js.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy --schema=prisma/schema.prisma && node apps/api/dist/all-in-one.js"]
