FROM node:26-alpine AS base

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g corepack && corepack enable && pnpm install --ignore-scripts

COPY . .
RUN pnpm run build

EXPOSE 3000
CMD ["pnpm", "start"]
