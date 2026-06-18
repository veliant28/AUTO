# Auto Parts Store — Frontend

Next.js 16 + TypeScript + Tailwind CSS фронтенд для интернет-магазина автозапчастей.

## Быстрый старт

```bash
pnpm install
pnpm dev
```

Откройте http://localhost:3000

## Тесты

```bash
pnpm test              # однократно
pnpm test:watch        # в режиме watch
pnpm test:coverage     # с отчётом о покрытии
```

## Структура

```
app/                    — страницы и роутинг (Next.js App Router)
components/
  features/             — функциональные компоненты
  layout/               — Header, Footer
  ui/                   — переиспользуемые UI-компоненты
  vehicles/             — выбор авто
hooks/                  — React hooks (React Query + Zustand)
store/                  — Zustand store (auth, cart, favorites, vehicle)
lib/
  api/                  — API клиент (axios + типы)
  types/                — TypeScript типы для store и React Query
  validations/          — Zod схемы
tests/                  — Jest + RTL тесты
```
