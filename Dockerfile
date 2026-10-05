FROM node:20-alpine AS base
RUN corepack enable pnpm
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/tokens/package.json ./packages/tokens/
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

FROM deps AS tokens-builder
COPY packages/tokens ./packages/tokens
RUN pnpm --filter @c54/tokens build

FROM deps AS prisma-generator
COPY prisma ./prisma
RUN pnpm exec prisma generate

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=tokens-builder /app/packages/tokens/build ./packages/tokens/build
COPY --from=prisma-generator /app/src/generated ./src/generated
COPY . .
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/packages/tokens/build ./packages/tokens/build

EXPOSE 3000
CMD ["pnpm", "start"]

# The audit worker runs TypeScript directly under tsx, so unlike `runner` it
# needs the devDependencies and the source tree rather than a compiled `.next`.
# It is built from `deps` because that is where `pnpm install` has already put
# every dependency, dev included.
#
# Without this image the audit trail silently stops being written: the app
# queues events to Redis, nothing drains them, and `/audit` shows an empty
# trail that looks exactly like a quiet week.
FROM deps AS worker
COPY --from=prisma-generator /app/src/generated ./src/generated
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

# Migrations travel with the worker so the compose stack can be brought up from
# scratch without a separate migrate step.
COPY prisma ./prisma

# Fail the build rather than ship an image whose worker cannot resolve the
# generated Prisma client or the `@/*` path alias.
RUN pnpm exec tsx -e "import { AUDIT_HEARTBEAT_KEY } from '@/lib/audit/heartbeat'; import { PrismaClient } from '@/generated/prisma/client'; console.log('worker image ok:', AUDIT_HEARTBEAT_KEY, typeof PrismaClient)"

CMD ["pnpm", "worker:audit"]
