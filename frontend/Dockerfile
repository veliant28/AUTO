FROM node:22-alpine AS base

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --ignore-scripts || true

COPY . .
RUN pnpm run build

EXPOSE 3000
CMD ["pnpm", "start"]
