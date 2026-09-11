FROM node:24.20.0-bookworm-slim

WORKDIR /workspace

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY back/package.json back/package.json
COPY back/prisma/schema.prisma back/prisma/schema.prisma

RUN pnpm install --frozen-lockfile --filter back

COPY back back

RUN pnpm --filter back prisma:generate
