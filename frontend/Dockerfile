FROM node:26-alpine AS base

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --ignore-scripts 2>/dev/null; exit 0

COPY . .
RUN pnpm run build

EXPOSE 3000
CMD ["pnpm", "start"]
