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
