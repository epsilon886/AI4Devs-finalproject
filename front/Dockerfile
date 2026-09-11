FROM node:24.20.0-bookworm-slim

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY front/package.json front/package.json

RUN pnpm install --frozen-lockfile --filter front

COPY front front

EXPOSE 5173

CMD ["pnpm", "--filter", "front", "dev"]
