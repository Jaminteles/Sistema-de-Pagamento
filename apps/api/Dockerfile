# Imagem da API NestJS. O contexto de build e a raiz do monorepo.
# Base Debian slim (nao Alpine) porque o argon2 publica binarios prontos para glibc.

FROM node:24-bookworm-slim AS build
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN corepack enable
WORKDIR /app

# Manifests primeiro: aproveita o cache do Docker entre builds.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile --filter "@sistema/api..."

COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm --filter @sistema/shared build \
    && pnpm --filter @sistema/api exec prisma generate \
    && pnpm --filter @sistema/api build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

# O CLI do Prisma continua na imagem para rodar `prisma migrate deploy` no deploy.
COPY --from=build /app /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/main.js"]
