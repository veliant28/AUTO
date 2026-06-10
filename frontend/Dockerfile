FROM node:26-alpine AS base

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g corepack && corepack enable && pnpm install --ignore-scripts && \
  sed -i 's/\x7f/?/g' node_modules/echarts/lib/component/dataZoom/SliderZoomView.js 2>/dev/null || true

COPY . .
RUN pnpm run build

EXPOSE 3000
CMD ["pnpm", "start"]
