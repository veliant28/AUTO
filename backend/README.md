# Auto Parts Store — Backend

FastAPI + PostgreSQL + Redis бэкенд для интернет-магазина автозапчастей.

## Быстрый старт

```bash
# Установка зависимостей
pip install -r requirements.txt

# Настройка окружения
cp .env.example .env
# Заполните AUTO_PARTS_SECRET_KEY, AUTO_PARTS_TECDOC_API_KEY и др.

# Запуск (требуется PostgreSQL и Redis)
uvicorn app.main:app --reload --port 8000
```

## Тесты

```bash
pytest tests/ -v --cov=app --cov-report=term
```

## API документация

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- OpenAPI JSON: http://localhost:8000/api/v1/openapi.json

## Структура

```
app/
  api/v1/endpoints/   — API эндпоинты
  core/               — конфиг, middleware, exceptions, health
  models/             — SQLAlchemy модели
  schemas/            — Pydantic схемы
  services/           — бизнес-логика (cache, sku_generator)
tests/                — pytest тесты
```
