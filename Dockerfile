FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Prisma and the server-side env validator are evaluated during the build.
# These are build-only placeholders; runtime values come from .env.docker.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build \
    SHADOW_DATABASE_URL=postgresql://build:build@localhost:5432/build_shadow \
    BETTER_AUTH_SECRET=build-only-placeholder-secret-0000000000000000 \
    BETTER_AUTH_URL=http://localhost:3000 \
    ENTITLEMENT_SHARED_SECRET=build-only-entitlement-secret \
    STRIPE_SECRET_KEY=sk_test_build \
    STRIPE_WEBHOOK_SECRET=whsec_build

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.output ./.output
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/package.json ./package.json
COPY docker/entrypoint.sh ./docker/entrypoint.sh

RUN chmod +x ./docker/entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(async r => { if (!r.ok) process.exit(1); const body = await r.json(); if (!body.ok) process.exit(1) }).catch(() => process.exit(1))"

ENTRYPOINT ["./docker/entrypoint.sh"]
