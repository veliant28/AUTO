# AutoParts Store

Full-stack auto parts e-commerce platform with TecDoc catalog integration, admin panel, RBAC, multi-language support (RU/EN/UA), and Telegram notifications.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16, TypeScript, Tailwind CSS, shadcn/ui |
| **Backend** | FastAPI (Python 3.13), SQLAlchemy, Alembic |
| **Database** | PostgreSQL |
| **Cache** | Redis |
| **Charts** | Apache ECharts |
| **i18n** | next-intl |
| **Containers** | Docker, Docker Compose |

## Features

- **Catalog** — TecDoc-based parts catalog with vehicle selector (brand → model → modification), category filters, search with autocomplete
- **Part Details** — Image gallery, attributes, cross-references, vehicle applicability
- **Cart & Checkout** — Client-side cart (zustand + persist), order form with validation
- **User Profiles** — Avatar system (DiceBear), avatar style picker, Telegram connect
- **Garage** — Save and manage vehicles for quick parts lookup
- **Favorites** — Save favorite parts (requires auth)
- **Orders** — Order history with status tracking
- **Admin Panel** — Dashboard (ECharts: orders by day, revenue by day, orders by status, parts by category), Users CRUD (TanStack Table), Orders management with inline status update
- **RBAC** — Roles: `admin`, `manager`, `operator` with granular access control
- **Telegram Notifications** — Bot integration for order status changes
- **Multi-language** — Russian, English, Ukrainian (next-intl v4)

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local frontend dev)
- Python 3.13+ (for local backend dev)

### Run with Docker

```bash
# Clone and start all services
git clone <repo-url> && cd auto
docker compose up -d

# Services:
# - Frontend:  http://localhost:3080
# - Backend:   http://localhost:8080
# - PostgreSQL: localhost:5435
# - Redis:     localhost:6382
```

### Rebuild frontend after changes

```bash
docker compose stop frontend
docker compose rm -f frontend
docker rmi auto-frontend
docker compose build frontend --no-cache
docker compose up -d frontend
```

## Project Structure

```
auto/
├── frontend/                    # Next.js 16 application
│   ├── app/
│   │   └── [locale]/           # i18n routes (ru/en/ua)
│   │       ├── admin/          # Admin panel
│   │       ├── auth/           # Login, register, password reset
│   │       ├── cart/           # Shopping cart
│   │       ├── catalog/        # Parts catalog + search
│   │       ├── checkout/       # Order checkout
│   │       ├── favorites/      # Favorites
│   │       ├── garage/         # Vehicle garage
│   │       ├── orders/         # Orders list + detail
│   │       ├── profile/        # Profile + settings
│   │       └── pages/          # Static pages (about, contacts, etc.)
│   ├── components/
│   │   ├── features/           # Feature components
│   │   ├── layout/             # Header, Footer
│   │   └── ui/                 # shadcn/ui components
│   ├── messages/               # i18n locale files
│   ├── store/                  # Zustand stores
│   ├── hooks/                  # Custom React hooks
│   └── lib/                    # Utilities, API client
│
├── backend/                     # FastAPI application
│   ├── app/
│   │   ├── api/v1/             # API endpoints
│   │   │   └── endpoints/      # auth, cart, catalog, orders, admin, etc.
│   │   ├── models/             # SQLAlchemy models
│   │   ├── schemas/            # Pydantic schemas
│   │   └── services/           # Business logic
│   └── requirements.txt
│
└── docker-compose.yml           # All services config
```

## Environment Variables

Key variables in `frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
```

## Docker Ports

| Service    | Port |
|-----------|------|
| Frontend  | 3080 |
| Backend   | 8080 |
| PostgreSQL | 5435 |
| Redis     | 6382 |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/login` | Login |
| POST | `/api/v1/auth/register` | Register |
| GET | `/api/v1/catalog/makes` | Vehicle brands |
| GET | `/api/v1/catalog/models/{make_id}` | Vehicle models |
| GET | `/api/v1/catalog/modifications/{model_id}` | Modifications |
| GET | `/api/v1/catalog/search?q=` | Search parts |
| GET | `/api/v1/catalog/parts/{article}` | Part detail |
| GET | `/api/v1/cart` | Get cart |
| POST | `/api/v1/cart/sync` | Sync cart |
| GET | `/api/v1/orders` | User orders |
| POST | `/api/v1/orders/checkout` | Create order |
| GET | `/api/v1/favorites` | Favorites |
| GET/POST/PUT/DELETE | `/api/v1/admin/users` | Admin: users CRUD |
| GET | `/api/v1/admin/orders` | Admin: orders list |
| PUT | `/api/v1/admin/orders/{id}/status` | Admin: update status |
| GET | `/api/v1/admin/dashboard` | Admin: dashboard stats |

## RBAC Roles

| Role | Permissions |
|------|------------|
| **admin** | Full access — dashboard, users CRUD, orders management |
| **manager** | Dashboard, orders management, view users |
| **operator** | Dashboard, view orders, update order status |

## Telegram Bot

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Set `TELEGRAM_BOT_TOKEN` in backend environment
3. Users connect via `/profile/settings` → Telegram section
4. Bot sends notifications on order status changes
