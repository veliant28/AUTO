# План улучшений AutoParts Store

## Общая информация

**Проект**: Full-stack e-commerce платформы для запчастей
**Стек**: FastAPI (Python 3.14) + Next.js 16 (TypeScript)
**Текущая оценка**: 7.5/10

---

## P0: Критичные улучшения безопасности (незамедлительно)

### 1.1. Замена хеширования паролей на криптографически стойкий метод

**Проблема**: Используется `hashlib.sha256` вместо PBDK (Password-Based Key Derivation)
- SHA256 не имеет соли
- SHA256 не имеет slow hashing (можно вычислять быстро)
- Хеширование выполняется при каждом логине (повторные вычисления)

**Файлы для изменения**:
- `backend/app/api/v1/endpoints/auth.py` (строки 65, 86, 118)
- `backend/app/api/v1/endpoints/users.py` (если есть)

**Шаги**:

1. **Добавить зависимость в `backend/requirements.txt`**:
   ```python
   passlib[bcrypt]==1.7.4
   ```

2. **Создать файл `backend/app/core/security.py`**:
   ```python
   from passlib.context import CryptContext

   # Для продакшена используем bcrypt с salt rounds = 12 (компромисс между скоростью и безопасностью)
   # Для dev окружения можно использовать слои соли (3-4)
   pwd_context = CryptContext(
       schemes=["bcrypt"],
       deprecated="auto",
   )

   def verify_password(plain_password: str, hashed_password: str) -> bool:
       """Проверка пароля с bcrypt"""
       return pwd_context.verify(plain_password, hashed_password)

   def get_password_hash(password: str) -> str:
       """Хеширование пароля с bcrypt"""
       return pwd_context.hash(password)

   def verify_token_signature(token: str, secret_key: str) -> bool:
       """Проверка подписи JWT токена (replaces hmac.compare_digest)"""
       try:
           payload, sig = token.rsplit(".", 1)
           expected = pwd_context.hash(f"{payload}.{secret_key}")
           return pwd_context.verify(sig, expected)
       except:
           return False
   ```

3. **Обновить `backend/app/api/v1/endpoints/auth.py`**:

   Заменить функции хеширования:
   ```python
   # В начале файла:
   from app.core.security import get_password_hash, verify_password

   # Заменить строку 65:
   # OLD: hashed = hashlib.sha256(data.password.encode()).hexdigest()
   # NEW:
   hashed = get_password_hash(data.password)

   # Заменить строку 86:
   # OLD: hashed = hashlib.sha256(data.password.encode()).hexdigest()
   # NEW:
   hashed = get_password_hash(data.password)

   # Заменить строку 118:
   # OLD: hashed = hashlib.sha256(data.password.encode()).hexdigest()
   # NEW:
   hashed = get_password_hash(data.password)
   ```

4. **Обновить `backend/app/models/auth.py`** (если нужно, для миграции):
   ```python
   # При необходимости создать миграцию Alembic для существующих паролей
   # Так как SHA256 был уязвим, пароли пользователей нужно сбросить
   # Это можно сделать через админку или SQL

   # SQL для сброса всех паролей:
   # UPDATE users SET password_hash = NULL WHERE password_hash IS NOT NULL;
   # Или через админку: запросить всех пользователей сбросить пароли
   ```

5. **Добавить тесты безопасности**:
   ```python
   # backend/tests/test_security.py
   def test_password_hashing():
       """Тест на уникальность хешей"""
       password = "test123"
       hash1 = get_password_hash(password)
       hash2 = get_password_hash(password)
       assert hash1 != hash2, "Bcrypt hashes should be different for same password"
       assert verify_password(password, hash1)

   def test_password_verification():
       """Тест на проверку пароля"""
       password = "correct_password"
       hashed = get_password_hash(password)
       assert verify_password(password, hashed)
       assert not verify_password("wrong_password", hashed)
   ```

**Время реализации**: 2-3 часа
**Риск**: Низкий (passlib хорошо протестирована)
**Затраты**: 1 строка в requirements.txt + изменения в 3 функциях

---

### 1.2. Удаление API ключей из репозитория

**Проблема**: `opencode.json` содержит чувствительные API ключи (TECDOC_API_KEY, TECDOC_API_SECRET, SECRET_KEY)
- Уже в .gitignore, но еще не удален из истории
- Любой коммиттер может увидеть ключи
- Если ключи скомпрометированы, нужно отозвать их

**Файлы для изменения**:
- `opencode.json` (удалить API ключи)
- `backend/app/core/config.py` (использовать переменные окружения)
- `.gitignore` (проверить, что .env включен)

**Шаги**:

1. **Обновить `.gitignore`**:
   ```gitignore
   # opencode config (contains API keys)
   opencode.json

   # Secrets (добавить, если нет)
   .env
   .env.local
   .env.production
   .env.development
   ```

2. **Обновить `backend/app/core/config.py`**:
   ```python
   from pydantic_settings import BaseSettings, SettingsConfigDict
   from pydantic import Field
   import os

   class Settings(BaseSettings):
       model_config = SettingsConfigDict(
           env_file=".env",
           env_file_encoding="utf-8",
           extra="ignore",
           env_prefix="AUTO_PARTS_",
       )

       PROJECT_NAME: str = "Auto Parts Store"
       API_V1_STR: str = "/api/v1"
       SECRET_KEY: str = Field(
           default=lambda: os.getenv("AUTO_PARTS_SECRET_KEY", ""),
           min_length=16,
       )

       # Database
       POSTGRES_USER: str = Field(default=os.getenv("POSTGRES_USER", "postgres"))
       POSTGRES_PASSWORD: str = Field(min_length=1)
       POSTGRES_SERVER: str = Field(default=os.getenv("POSTGRES_SERVER", "localhost"))
       POSTGRES_PORT: int = Field(default=5432)
       POSTGRES_DB: str = Field(default=os.getenv("POSTGRES_DB", "autoparts"))
       DB_POOL_SIZE: int = Field(default=20)
       DB_MAX_OVERFLOW: int = Field(default=10)

       # Redis
       REDIS_HOST: str = Field(default=os.getenv("REDIS_HOST", "localhost"))
       REDIS_PORT: int = Field(default=6379)

       # TecDoc API
       TECDOC_API_URL: str = Field(
           default="https://auto-db.pro/api/v1/",
           description="TecDoc API base URL"
       )
       TECDOC_API_KEY: str = Field(min_length=1, description="TecDoc API key")
       TECDOC_API_SECRET: str = Field(min_length=1, description="TecDoc API secret")
       TECDOC_REQUEST_TIMEOUT: int = Field(default=30)

       # Rate Limiting
       TECDOC_MAX_ACTIONS_PER_HOUR: int = Field(
           default=3300, ge=1, le=10000,
           description="Maximum API calls per hour"
       )

       # Telegram
       TELEGRAM_BOT_TOKEN: str = Field(default="", description="Telegram bot token")
       TELEGRAM_WEBHOOK_URL: str = Field(default="", description="Telegram webhook URL")
       TELEGRAM_BOT_USERNAME: str = Field(default="SVOMBot")

       def __init__(self, **kwargs):
           super().__init__(**kwargs)
           # Проверка обязательных переменных
           if not self.TECDOC_API_KEY:
               raise ValueError("TECDOC_API_KEY must be set in environment")
           if not self.TECDOC_API_SECRET:
               raise ValueError("TECDOC_API_SECRET must be set in environment")
           if not self.POSTGRES_PASSWORD:
               raise ValueError("POSTGRES_PASSWORD must be set in environment")

   settings = Settings()
   ```

3. **Создать `.env.example`** (шаблон для окружения):
   ```bash
   # Database
   AUTO_PARTS_POSTGRES_USER=postgres
   AUTO_PARTS_POSTGRES_PASSWORD=your_secure_password
   AUTO_PARTS_POSTGRES_SERVER=localhost
   AUTO_PARTS_POSTGRES_DB=autoparts

   # TecDoc API
   AUTO_PARTS_TECDOC_API_KEY=your_tecdoc_api_key_here
   AUTO_PARTS_TECDOC_API_SECRET=your_tecdoc_api_secret_here

   # Rate Limiting
   AUTO_PARTS_TECDOC_MAX_ACTIONS_PER_HOUR=3300

   # Telegram
   AUTO_PARTS_TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
   AUTO_PARTS_TELEGRAM_WEBHOOK_URL=
   AUTO_PARTS_TELEGRAM_BOT_USERNAME=SVOMBot

   # Secret Key (generate with: python -c "import secrets; print(secrets.token_urlsafe(32))")
   AUTO_PARTS_SECRET_KEY=your_very_long_secret_key_here
   ```

4. **Удалить чувствительные данные из `opencode.json`**:
   ```json
   {
     "$schema": "https://opencode.ai/config.json",
     "model": "kimchi/kimi-k2.6",
     "provider": {
       "kimchi": {
         "api": "openai",
         "options": {
           "baseURL": "https://llm.cast.ai/openai/v1"
         },
         "models": {
           "kimi-k2.5": {
             "id": "kimi-k2.5",
             "name": "Kimi K2.5",
             "reasoning": true,
             "tool_call": true,
             "cost": { "input": 1.5, "output": 7 },
             "limit": { "context": 262144, "output": 65536 }
           },
           "kimi-k2.6": {
             "id": "kimi-k2.6",
             "name": "Kimi K2.6",
             "reasoning": true,
             "tool_call": true,
             "cost": { "input": 2, "output": 8 },
             "limit": { "context": 262144, "output": 65536 }
           }
         }
       }
     }
   }
   ```

5. **Обновить `docker-compose.yml`** для поддержки переменных окружения:
   ```yaml
   backend:
     build: ./backend
     environment:
       AUTO_PARTS_POSTGRES_USER: ${POSTGRES_USER:-postgres}
       AUTO_PARTS_POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
       AUTO_PARTS_POSTGRES_SERVER: ${POSTGRES_SERVER:-postgres}
       AUTO_PARTS_TECDOC_API_KEY: ${TECDOC_API_KEY}
       AUTO_PARTS_TECDOC_API_SECRET: ${TECDOC_API_SECRET}
       AUTO_PARTS_TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
       AUTO_PARTS_SECRET_KEY: ${SECRET_KEY}
       TZ: Europe/Kyiv
   ```

6. **Создать `backend/.env.example`**:
   ```bash
   AUTO_PARTS_POSTGRES_USER=postgres
   AUTO_PARTS_POSTGRES_PASSWORD=your_password
   AUTO_PARTS_TECDOC_API_KEY=your_key
   AUTO_PARTS_TECDOC_API_SECRET=your_secret
   AUTO_PARTS_TELEGRAM_BOT_TOKEN=your_bot_token
   AUTO_PARTS_SECRET_KEY=generate_via_script
   ```

7. **Настроить CI/CD (GitHub Actions или GitLab CI)** для использования секретов:
   ```yaml
   # .github/workflows/backend-tests.yml
   environment:
     name: production
     url: https://api.example.com
   secrets:
     AUTO_PARTS_TECDOC_API_KEY
     AUTO_PARTS_TECDOC_API_SECRET
     AUTO_PARTS_POSTGRES_PASSWORD
     AUTO_PARTS_TELEGRAM_BOT_TOKEN
     AUTO_PARTS_SECRET_KEY
   ```

8. **Очистить git history** (если ключи уже были в коммитах):
   ```bash
   # Это удалит API ключи из всей истории репозитория
   # Будет затронен каждый коммит
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch opencode.json" \
     --prune-empty --tag-name-filter cat -- --all

   # Затем:
   git push origin --force --all
   ```

**Время реализации**: 2-4 часа (включая git cleanup)
**Риск**: Средний (нужно проверить что не ломается Docker Compose)
**Затраты**: Время на настройку CI/CD

---

## P1: Добавление тестирования (Критичное)

### 2.1. Backend тесты (pytest)

**Проблема**: Отсутствие unit и integration тестов
- Нет уверенности в корректности бизнес-логики
- Риск регрессий при новых изменениях
- Нет CI/CD с тестами

**Файлы для создания**:
- `backend/requirements.txt` (добавить pytest)
- `backend/tests/` (директория для тестов)
- `backend/tests/__init__.py`

**Шаги**:

1. **Добавить зависимости в `backend/requirements.txt`**:
   ```python
   # Тестирование
   pytest==8.3.*
   pytest-asyncio==0.25.*
   pytest-cov==6.0.*
   pytest-mock==3.14.*
   httpx==0.28.*
   ```

2. **Создать `backend/tests/__init__.py`**:
   ```python
   import sys
   import os

   # Добавить app в Python path
   sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
   ```

3. **Создать `backend/tests/conftest.py`** (fixtures для pytest):
   ```python
   import pytest
   from fastapi.testclient import TestClient
   from sqlalchemy import create_engine
   from sqlalchemy.orm import sessionmaker

   from app.core.config import settings
   from app.core.db import get_db, get_tecdoc_db
   from app.main import app
   from app.models import Base, User, Role

   # Использовать SQLite для тестов
   SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

   engine = create_engine(
       SQLALCHEMY_DATABASE_URL,
       connect_args={"check_same_thread": False},
       echo=False,
   )
   TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

   @pytest.fixture(scope="function")
   def db():
       """Создаем временную БД для каждого теста"""
       Base.metadata.create_all(bind=engine)
       db = TestSessionLocal()
       try:
           yield db
       finally:
           db.close()
           Base.metadata.drop_all(bind=engine)

   @pytest.fixture(scope="function")
   def client(db):
       """TestClient с правильным db session"""
       def override_get_db():
           try:
               yield db
           finally:
               pass

       app.dependency_overrides[get_db] = override_get_db
       with TestClient(app) as test_client:
           yield test_client
       app.dependency_overrides.clear()

   @pytest.fixture
   def test_user(db):
       """Создаем тестового пользователя"""
       role = Role(name="retail", permissions="read,write")
       db.add(role)
       db.commit()
       db.refresh(role)

       user = User(
           email="test@example.com",
           password_hash="hashed_password",
           first_name="Test",
           avatar_index=0,
           role_id=role.id,
       )
       db.add(user)
       db.commit()
       db.refresh(user)
       return user

   @pytest.fixture
   def auth_headers(client, test_user):
       """Возвращаем заголовки с авторизацией"""
       response = client.post(
           "/api/v1/auth/login",
           json={"email": test_user.email, "password": "test_password"}
       )
       return {"Authorization": f"Bearer {response.json()['access_token']}"}
   ```

4. **Создать `backend/tests/test_auth.py`** (тестируем аутентификацию):
   ```python
   import pytest
   from app.core.security import verify_password, get_password_hash

   def test_password_hashing():
       """Тест на уникальность хешей bcrypt"""
       password = "test123"
       hash1 = get_password_hash(password)
       hash2 = get_password_hash(password)
       assert hash1 != hash2, "Bcrypt hashes should be different for same password"

   def test_password_verification():
       """Тест на проверку пароля"""
       password = "correct_password"
       hashed = get_password_hash(password)
       assert verify_password(password, hashed)
       assert not verify_password("wrong_password", hashed)

   def test_register(client, db):
       """Тест регистрации нового пользователя"""
       response = client.post(
           "/api/v1/auth/register",
           json={
               "email": "newuser@example.com",
               "password": "TestPass123",
               "first_name": "John"
           }
       )
       assert response.status_code == 200
       data = response.json()
       assert "access_token" in data
       assert data["email"] == "newuser@example.com"

   def test_login(client, test_user):
       """Тест логина"""
       response = client.post(
           "/api/v1/auth/login",
           json={
               "email": test_user.email,
               "password": "test_password"
           }
       )
       assert response.status_code == 200
       data = response.json()
       assert "access_token" in data
       assert data["user_id"] == test_user.id

   def test_login_wrong_password(client, test_user):
       """Тест с неправильным паролем"""
       response = client.post(
           "/api/v1/auth/login",
           json={
               "email": test_user.email,
               "password": "wrong_password"
           }
       )
       assert response.status_code == 401

   def test_register_duplicate_email(client, test_user):
       """Тест с дубликатом email"""
       response = client.post(
           "/api/v1/auth/register",
           json={
               "email": test_user.email,
               "password": "TestPass123",
               "first_name": "Another"
           }
       )
       assert response.status_code == 400

   def test_get_current_user(client, auth_headers):
       """Тест получения текущего пользователя"""
       response = client.get(
           "/api/v1/users/me",
           headers=auth_headers
       )
       assert response.status_code == 200
       data = response.json()
       assert "email" in data
   ```

5. **Создать `backend/tests/test_catalog.py`** (тестируем каталог):
   ```python
   import pytest
   from app.models import VehicleBrand, VehicleModel, PartCategory

   def test_get_makes(client, db):
       """Тест получения списка брендов"""
       response = client.get("/api/v1/catalog/makes")
       assert response.status_code == 200
       brands = response.json()
       assert isinstance(brands, list)
       # Проверяем, что бренды имеют необходимые поля
       if brands:
           assert "id" in brands[0]
           assert "name" in brands[0]

   def test_get_models(client, db):
       """Тест получения моделей по бренду"""
       # Создаем тестовый бренд
       brand = VehicleBrand(
           tecdoc_id=1,
           name="TestBrand"
       )
       db.add(brand)
       db.commit()

       response = client.get(f"/api/v1/catalog/models/{brand.id}")
       assert response.status_code == 200
       models = response.json()
       assert isinstance(models, list)

   def test_get_sections(client, db):
       """Тест получения секций каталога"""
       response = client.get("/api/v1/catalog/sections/1")
       assert response.status_code == 200
       sections = response.json()
       assert isinstance(sections, list)
   ```

6. **Создать `backend/tests/test_admin.py`** (тестируем админку):
   ```python
   import pytest

   def test_admin_dashboard(client, auth_headers):
       """Тест дашборда админки"""
       response = client.get(
           "/api/v1/admin/dashboard",
           headers=auth_headers
       )
       assert response.status_code == 200
       data = response.json()
       # Проверяем, что возвращается статистика
       assert isinstance(data, dict)

   def test_get_users(client, auth_headers, test_user):
       """Тест получения списка пользователей"""
       response = client.get(
           "/api/v1/admin/users",
           headers=auth_headers
       )
       assert response.status_code == 200
       users = response.json()
       assert isinstance(users, list)

   def test_create_product(client, auth_headers):
       """Тест создания продукта (если есть API)"""
       # TODO: Добавить Product schema для теста
       pass
   ```

7. **Добавить скрипт для запуска тестов**:
   ```bash
   # backend/tests/run_tests.sh
   #!/bin/bash
   pytest tests/ -v --cov=app --cov-report=html --cov-report=term
   ```

8. **Добавить pytest.ini**:
   ```ini
   [pytest]
   testpaths = tests
   python_files = test_*.py
   python_functions = test_*
   asyncio_mode = auto
   addopts =
       --strict-markers
       --disable-warnings
   ```

9. **Добавить команды в Makefile** (или setup.py):
   ```bash
   # Makefile или setup.cfg
   test:
       pytest tests/ -v --cov=app

   test-coverage:
       pytest tests/ --cov=app --cov-report=html
       @echo "Coverage report: coverage_html/index.html"
   ```

10. **Запустить тесты и проверить покрытие**:
    ```bash
    cd backend
    pytest tests/ -v --cov=app --cov-report=html
    ```

**Цель**: Покрытие >= 70% кода тестами

**Время реализации**: 8-12 часов
**Риск**: Средний (нужно настроить fixtures и зависимости)
**Затраты**: Время на написание тестов

---

### 2.2. Frontend тесты (Jest + React Testing Library)

**Проблема**: Отсутствие тестов для frontend
- Нет уверенности в корректности UI
- Риск поломки компонентов при рефакторинге

**Файлы для создания**:
- `frontend/package.json` (добавить jest, testing-library)
- `frontend/jest.config.js` (конфигурация Jest)
- `frontend/tests/` (директория для тестов)
- `frontend/tests/setup.ts` (setup тестов)

**Шаги**:

1. **Добавить зависимости в `frontend/package.json`**:
   ```json
   {
     "devDependencies": {
       "@testing-library/jest-dom": "^6.6.3",
       "@testing-library/react": "^16.1.0",
       "@testing-library/user-event": "^14.5.2",
       "@types/jest": "^29.5.0",
       "jest": "^29.7.0",
       "jest-environment-jsdom": "^29.7.0"
     }
   }
   ```

2. **Создать `frontend/jest.config.js`**:
   ```javascript
   const nextJest = require('next/jest')

   const createJestConfig = nextJest({
     dir: './',
   })

   const customJestConfig = {
     setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
     testEnvironment: 'jest-environment-jsdom',
     moduleNameMapper: {
       '^@/(.*)$': '<rootDir>/$1',
     },
     testMatch: ['**/__tests__/**/*.[jt]s?(x)'],
     collectCoverageFrom: [
       'app/**/*.{js,jsx,ts,tsx}',
       '!app/**/*.d.ts',
       '!app/**/layout.{js,jsx,ts,tsx}',
       '!app/**/page.{js,jsx,ts,tsx}',
     ],
     coverageThreshold: {
       global: {
         branches: 70,
         functions: 70,
         lines: 70,
         statements: 70,
       },
     },
   }

   module.exports = createJestConfig(customJestConfig)
   ```

3. **Создать `frontend/tests/setup.ts`**:
   ```typescript
   import '@testing-library/jest-dom'
   import { cleanup } from '@testing-library/react'
   import { afterEach } from 'vitest'

   afterEach(() => {
     cleanup()
   })
   ```

4. **Создать `frontend/tests/__mocks__/next-router.ts`**:
   ```typescript
   import { Router as RouterMock } from 'next/router'

   const mockPush = jest.fn()
   const mockReplace = jest.fn()
   const mockPrefetch = jest.fn()
   const mockReload = jest.fn()
   const mockBack = jest.fn()

   const useRouter = jest.fn(() => ({
     push: mockPush,
     replace: mockReplace,
     prefetch: mockPrefetch,
     reload: mockReload,
     back: mockBack,
     pathname: '/test',
     query: {},
     asPath: '/test',
   }))

   const mockPathname = '/test'
   const mockQuery = {}
   const mockAsPath = '/test'

   const usePathname = jest.fn(() => mockPathname)
   const useQuery = jest.fn(() => mockQuery)
   const useSearchParams = jest.fn(() => ({
     get: jest.fn(() => null),
   }))

   jest.mock('next/router', () => ({
     useRouter,
     usePathname,
     useQuery,
     useSearchParams,
   }))

   export { RouterMock }
   ```

5. **Создать `frontend/tests/__mocks__/zustand.ts`**:
   ```typescript
   import { renderHook, act } from '@testing-library/react'
   import { useStore } from 'hooks/useStore'

   jest.mock('zustand', () => ({
     ...jest.requireActual('zustand'),
     useStore: jest.fn(),
   }))

   const mockUseStore = useStore as jest.Mock

   export const createMockStore = (initialState: any) => {
     let currentState = { ...initialState }
     let listeners = new Set()

     return {
       getState: () => currentState,
       setState: (partialState: Partial<typeof initialState>) => {
         currentState = { ...currentState, ...partialState }
         listeners.forEach((listener) => listener(currentState))
       },
       subscribe: (listener: (state: typeof initialState) => void) => {
         listeners.add(listener)
         return () => listeners.delete(listener)
       },
     }
   }

   export const renderMockStore = (initialState: any) => {
     mockUseStore.mockReturnValue(createMockStore(initialState))
     return renderHook(() => mockUseStore())
   }
   ```

6. **Создать `frontend/tests/api.test.ts`** (тесты для API):
   ```typescript
   import { apiClient } from 'lib/api'

   describe('API Client', () => {
     beforeEach(() => {
       // Reset mock
       jest.clearAllMocks()
     })

     test('GET request with query params', async () => {
       // TODO: Add tests for API calls
     })

     test('POST request with body', async () => {
       // TODO: Add tests for POST requests
     })
   })
   ```

7. **Добавить скрипты в `frontend/package.json`**:
   ```json
   {
     "scripts": {
       "test": "jest",
       "test:watch": "jest --watch",
       "test:coverage": "jest --coverage"
     }
   }
   ```

8. **Создать тест для компонента Header**:
   ```typescript
   // frontend/components/layout/__tests__/Header.test.tsx
   import { render, screen } from '@testing-library/react'
   import Header from '../Header'

   describe('Header Component', () => {
     test('renders navigation links', () => {
       render(<Header />)
       expect(screen.getByText(/home/i)).toBeInTheDocument()
       expect(screen.getByText(/catalog/i)).toBeInTheDocument()
     })

     test('renders search input', () => {
       render(<Header />)
       expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
     })
   })
   ```

9. **Добавить флаг для использования test environment**:
   ```typescript
   // frontend/tests/setup.ts
   import '@testing-library/jest-dom'

   // Устанавливаем mock для localStorage
   const localStorageMock = {
     getItem: jest.fn(),
     setItem: jest.fn(),
     clear: jest.fn(),
   }

   global.localStorage = localStorageMock as any
   ```

10. **Запустить тесты**:
    ```bash
    cd frontend
    npm test -- --watchAll
    ```

**Цель**: Покрытие >= 60% для компонентов

**Время реализации**: 8-10 часов
**Риск**: Средний
**Затраты**: Время на написание тестов

---

### 2.3. Интеграционные тесты (FastAPI + PostgreSQL)

**Проблема**: Нет end-to-end тестов для полного цикла работы

**Шаги**:

1. **Добавить зависимость для тестов**:
   ```python
   # backend/requirements.txt
   pytest-postgresql==5.0.0
   ```

2. **Создать `backend/tests/test_integration.py`**:
   ```python
   import pytest
   from httpx import AsyncClient
   from app.main import app

   @pytest.mark.asyncio
   async def test_checkout_flow(async_client: AsyncClient):
       """Тест полного цикла заказа"""
       # 1. Регистрация
       register_response = await async_client.post(
           "/api/v1/auth/register",
           json={
               "email": "checkout@test.com",
               "password": "TestPass123",
               "first_name": "Test"
           }
       )
       assert register_response.status_code == 200
       token = register_response.json()["access_token"]

       # 2. Добавление товара в корзину
       cart_response = await async_client.post(
           "/api/v1/cart/items",
           headers={"Authorization": f"Bearer {token}"},
           json={
               "article": "123456",
               "quantity": 2
           }
       )
       assert cart_response.status_code == 200

       # 3. Проверка корзины
       cart = await async_client.get(
           "/api/v1/cart",
           headers={"Authorization": f"Bearer {token}"}
       )
       assert cart.status_code == 200
       assert len(cart.json()["items"]) == 1

       # 4. Оформление заказа
       checkout_response = await async_client.post(
           "/api/v1/orders/checkout",
           headers={"Authorization": f"Bearer {token}"},
           json={
               "items": [{"article": "123456", "quantity": 2}],
               "name": "Test Customer",
               "phone": "+380111111111",
               "address": "Test Address"
           }
       )
       assert checkout_response.status_code == 201
       order_id = checkout_response.json()["id"]

       # 5. Проверка заказа
       orders_response = await async_client.get(
           "/api/v1/orders",
           headers={"Authorization": f"Bearer {token}"}
       )
       assert orders_response.status_code == 200
       orders = orders_response.json()
       assert len(orders) == 1
       assert orders[0]["id"] == order_id
   ```

**Время реализации**: 4-6 часов
**Риск**: Низкий
**Затраты**: Время на написание тестов

---

## P2: Архитектурные улучшения

### 3.1. Создание централизованных middleware и exceptions

**Проблема**: Отсутствие единой обработки ошибок и middleware

**Файлы для создания**:
- `backend/app/core/middleware.py`
- `backend/app/core/exceptions.py`
- `backend/app/core/logger.py`

**Шаги**:

1. **Создать `backend/app/core/exceptions.py`**:
   ```python
   from fastapi import HTTPException, Request
   from fastapi.responses import JSONResponse
   from typing import Union

   class AppException(Exception):
       """Базовое исключение для приложения"""
       def __init__(
           self,
           status_code: int = 500,
           message: str = "Internal server error",
           detail: Union[str, dict] = None
       ):
           self.status_code = status_code
           self.message = message
           self.detail = detail
           super().__init__(message)

   class BadRequestException(AppException):
       def __init__(self, message: str = "Bad request", detail: Union[str, dict] = None):
           super().__init__(status_code=400, message=message, detail=detail)

   class NotFoundException(AppException):
       def __init__(self, message: str = "Not found", detail: Union[str, dict] = None):
           super().__init__(status_code=404, message=message, detail=detail)

   class UnauthorizedException(AppException):
       def __init__(self, message: str = "Unauthorized", detail: Union[str, dict] = None):
           super().__init__(status_code=401, message=message, detail=detail)

   class ForbiddenException(AppException):
       def __init__(self, message: str = "Forbidden", detail: Union[str, dict] = None):
           super().__init__(status_code=403, message=message, detail=detail)

   class InternalServerErrorException(AppException):
       def __init__(self, message: str = "Internal server error", detail: Union[str, dict] = None):
           super().__init__(status_code=500, message=message, detail=detail)

   async def app_exception_handler(request: Request, exc: AppException):
       """Обработчик исключений приложения"""
       return JSONResponse(
           status_code=exc.status_code,
           content={
               "status": "error",
               "message": exc.message,
               "detail": exc.detail or {}
           }
       )

   async def http_exception_handler(request: Request, exc: HTTPException):
       """Обработчик стандартных HTTP исключений"""
       return JSONResponse(
           status_code=exc.status_code,
           content={
               "status": "error",
               "message": exc.detail,
               "detail": {}
           }
       )
   ```

2. **Создать `backend/app/core/middleware.py`**:
   ```python
   from fastapi import Request
   from fastapi.middleware.cors import CORSMiddleware
   from starlette.middleware.base import BaseHTTPMiddleware
   import time

   class LoggingMiddleware(BaseHTTPMiddleware):
       """Middleware для логирования запросов"""

       async def dispatch(self, request: Request, call_next):
           start_time = time.time()

           response = await call_next(request)

           process_time = (time.time() - start_time) * 1000

           # Логируем только важные запросы (не статические)
           if request.url.path not in ['/health', '/favicon.ico']:
               print(f" {request.method} {request.url.path} - {response.status_code} ({process_time:.2f}ms)")

           return response

   def setup_cors(app):
       """Настройка CORS middleware"""
       app.add_middleware(
           CORSMiddleware,
           allow_origins=["http://localhost:3000", "http://localhost:3080"],  # TODO: сделать production-ready
           allow_credentials=True,
           allow_methods=["*"],
           allow_headers=["*"],
       )
   ```

3. **Создать `backend/app/core/logger.py`**:
   ```python
   import logging
   from logging.handlers import RotatingFileHandler
   import os
   from app.core.config import settings

   def setup_logging():
       """Настройка логирования"""
       log_dir = "logs"
       os.makedirs(log_dir, exist_ok=True)

       # Формат лога
       formatter = logging.Formatter(
           '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
           datefmt='%Y-%m-%d %H:%M:%S'
       )

       # Логирование в файл
       file_handler = RotatingFileHandler(
           os.path.join(log_dir, 'app.log'),
           maxBytes=10 * 1024 * 1024,  # 10MB
           backupCount=5,
       )
       file_handler.setFormatter(formatter)

       # Логирование в консоль
       console_handler = logging.StreamHandler()
       console_handler.setFormatter(formatter)

       # Настройка root logger
       logger = logging.getLogger()
       logger.setLevel(logging.INFO)
       logger.addHandler(file_handler)
       logger.addHandler(console_handler)

       return logger

   logger = setup_logging()
   ```

4. **Обновить `backend/app/main.py`**:
   ```python
   from fastapi import FastAPI
   from fastapi.middleware.gzip import GZipMiddleware

   # Импорты из core
   from app.core.config import settings
   from app.core.exceptions import (
       app_exception_handler,
       http_exception_handler,
   )
   from app.core.middleware import setup_cors, LoggingMiddleware

   from app.api.v1.api import api_router

   app = FastAPI(
       title=settings.PROJECT_NAME,
       openapi_url=f"{settings.API_V1_STR}/openapi.json",
       version="1.0.0",
   )

   # Middleware
   app.add_middleware(GZipMiddleware, minimum_size=1000)
   app.add_middleware(LoggingMiddleware)
   setup_cors(app)

   # Exception handlers
   app.add_exception_handler(HTTPException, http_exception_handler)
   app.add_exception_handler(AppException, app_exception_handler)

   # Routes
   app.include_router(api_router, prefix=settings.API_V1_STR)

   @app.get("/health")
   async def health_check():
       return {"status": "ok"}
   ```

**Время реализации**: 3-4 часа
**Риск**: Низкий
**Затраты**: Время на рефакторинг

---

### 3.2. Улучшение структуры API endpoints

**Проблема**: 26 файлов API endpoints — много мелких, дублирующейся логики

**Шаги**:

1. **Сгруппировать по модулям**:
   ```
   backend/app/api/v1/endpoints/
   ├── __init__.py
   ├── auth.py
   ├── users.py
   ├── catalog/
   │   ├── __init__.py
   │   ├── main.py  # объединить catalog.py + catalog_local.py
   │   └── vehicle.py  # бренды, модели, модификации
   ├── orders/
   │   ├── __init__.py
   │   ├── main.py  # orders.py
   │   └── admin.py  # admin_orders.py
   ├── admin/
   │   ├── __init__.py
   │   ├── dashboard.py  # admin.py (только статистика)
   │   ├── users.py  # admin_users.py
   │   ├── products.py  # admin_products.py
   │   ├── catalog.py  # admin_catalog.py
   │   ├── suppliers.py  # admin_suppliers.py
   │   ├── pricing.py  # admin_pricing.py
   │   ├── imports.py  # admin_imports.py
   │   └── workers.py  # admin_workers.py
   ├── cart.py
   ├── favorites.py
   ├── categories.py
   ├── footer.py
   ├── settings.py
   ├── notifications.py
   └── telegram.py
   ```

2. **Пример: объединить catalog.py и catalog_local.py**:
   ```python
   # backend/app/api/v1/endpoints/catalog/main.py
   from fastapi import APIRouter, Depends
   from sqlalchemy.orm import Session
   from typing import List, Optional

   from app.core.db import get_db, get_tecdoc_db
   from app.models import VehicleBrand, VehicleModel, VehicleModification, PartCategory
   from app.schemas import BrandSchema, ModelSchema, ModSchema, PartCategorySchema

   router = APIRouter()

   @router.get("/makes", response_model=List[BrandSchema])
   async def get_makes(db: Session = Depends(get_db)):
       return db.query(VehicleBrand).all()

   @router.get("/models/{brand_id}", response_model=List[ModelSchema])
   async def get_models(brand_id: int, db: Session = Depends(get_db)):
       return db.query(VehicleModel).filter(VehicleModel.brand_id == brand_id).all()

   # ... и другие эндпоинты
   ```

3. **Пример: разделить admin.py**:
   ```python
   # backend/app/api/v1/endpoints/admin/dashboard.py
   from fastapi import Depends
   from sqlalchemy.orm import Session
   from app.core.db import get_db
   from app.models import User, Order, Part

   @router.get("/dashboard")
   async def get_dashboard_stats(db: Session = Depends(get_db)):
       # Статистика заказов по дням
       orders_stats = db.query(Order).all()

       # Статистика пользователей
       users_stats = db.query(User).count()

       # Статистика товаров по категориям
       parts_by_category = db.query(Part.category_id, func.count(Part.id)).group_by(Part.category_id).all()

       return {
           "orders": orders_stats,
           "users": users_stats,
           "parts_by_category": parts_by_category,
       }
   ```

**Время реализации**: 4-6 часов
**Риск**: Средний (нужно проверить что не ломается роутинг)
**Затраты**: Время на рефакторинг

---

### 3.3. Проверка валидации Pydantic schemas

**Проблема**: Некоторые эндпоинты могут не иметь валидации входных данных

**Шаги**:

1. **Проверить все schemas в `backend/app/schemas/`**:
   - Все входные данные должны быть валидированы через Pydantic
   - Использовать `Field()` для обязательных полей
   - Использовать validators для сложной логики

2. **Пример улучшения**:
   ```python
   # backend/app/schemas/orders.py
   from pydantic import BaseModel, Field, validator
   from datetime import datetime

   class OrderCreateSchema(BaseModel):
       user_id: int = Field(..., gt=0, description="ID пользователя")
       items: List[dict] = Field(..., min_length=1, description="Товары в заказе")
       name: str = Field(..., min_length=2, max_length=100)
       phone: str = Field(..., pattern=r'^\+380\d{9}$', description="Номер телефона")
       address: str = Field(..., min_length=5, max_length=500)

       @validator('items')
       def validate_items(cls, items):
           for item in items:
               if 'article' not in item or 'quantity' not in item:
                   raise ValueError('Item must contain article and quantity')
               if item['quantity'] <= 0:
                   raise ValueError('Quantity must be positive')
           return items
   ```

3. **Обновить эндпоинты для использования новых схем**:
   ```python
   from app.schemas.orders import OrderCreateSchema

   @router.post("/orders/checkout")
   async def checkout(data: OrderCreateSchema, db: Session = Depends(get_db)):
       # Pydantic валидация уже выполнена
       # Можно использовать data.model_dump() для доступа к данным
   ```

**Время реализации**: 2-3 часа
**Риск**: Низкий
**Затраты**: Время на проверку

---

## P3: DevOps и CI/CD

### 4.1. Настройка CI/CD

**Проблема**: Нет автоматического тестирования и деплоя

**Шаги**:

1. **Создать `.github/workflows/ci.yml`** (GitHub Actions):
   ```yaml
   name: CI

   on:
     push:
       branches: [main, develop]
     pull_request:
       branches: [main, develop]

   jobs:
     backend-tests:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4

         - name: Set up Python
           uses: actions/setup-python@v5
           with:
             python-version: '3.14'

         - name: Install dependencies
           run: |
             cd backend
             pip install -r requirements.txt
             pip install pytest pytest-cov pytest-postgresql

         - name: Run tests
           run: |
             cd backend
             pytest tests/ -v --cov=app --cov-report=xml

         - name: Upload coverage
           uses: codecov/codecov-action@v4
           with:
             file: ./backend/coverage.xml

     frontend-tests:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4

         - name: Set up Node.js
           uses: actions/setup-node@v5
           with:
             node-version: '22'
             cache: 'pnpm'

         - name: Install dependencies
           run: |
             cd frontend
             pnpm install

         - name: Run tests
           run: |
             cd frontend
             pnpm test -- --coverage

     docker-build:
       needs: [backend-tests, frontend-tests]
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4

         - name: Build Docker images
           run: |
             docker compose build

         - name: Run Docker Compose
           run: |
             docker compose up -d
   ```

2. **Создать `.github/workflows/deploy.yml`** (CI/CD):
   ```yaml
   name: Deploy

   on:
     push:
       branches: [main]

   jobs:
     deploy:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4

         - name: Deploy to server
           run: |
             # TODO: Настроить SSH для деплоя
             # ssh user@server 'cd /path/to/project && docker compose pull && docker compose up -d'
   ```

**Время реализации**: 4-6 часов
**Риск**: Средний
**Затраты**: Время на настройку CI/CD

---

### 4.2. Добавить health check и monitoring

**Шаги**:

1. **Добавить `backend/app/core/health.py`**:
   ```python
   from fastapi import APIRouter

   router = APIRouter()

   @router.get("/health")
   async def health_check():
       """Health check endpoint для Docker и load balancers"""
       return {"status": "ok", "service": "autoparts-backend"}

   @router.get("/health/detailed")
   async def health_check_detailed():
       """Detailed health check"""
       import os
       import redis
       import psycopg2

       checks = {
           "status": "ok",
           "services": {}
       }

       # Проверка PostgreSQL
       try:
           psycopg2.connect(
               host=os.getenv("POSTGRES_SERVER"),
               port=int(os.getenv("POSTGRES_PORT", 5432)),
               user=os.getenv("POSTGRES_USER"),
               password=os.getenv("POSTGRES_PASSWORD"),
               database=os.getenv("POSTGRES_DB")
           )
           checks["services"]["postgres"] = "ok"
       except Exception as e:
           checks["services"]["postgres"] = f"error: {str(e)}"
           checks["status"] = "degraded"

       # Проверка Redis
       try:
           redis_client = redis.Redis(
               host=os.getenv("REDIS_HOST", "localhost"),
               port=int(os.getenv("REDIS_PORT", 6379)),
               decode_responses=True
           )
           redis_client.ping()
           checks["services"]["redis"] = "ok"
       except Exception as e:
           checks["services"]["redis"] = f"error: {str(e)}"
           checks["status"] = "degraded"

       return checks
   ```

2. **Обновить `backend/app/api/v1/api.py`**:
   ```python
   from app.core.health import router as health_router

   api_router.include_router(health_router)
   ```

3. **Добавить Docker health check**:
   ```yaml
   # docker-compose.yml
   services:
     backend:
       healthcheck:
         test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
         interval: 30s
         timeout: 10s
         retries: 3
         start_period: 40s
   ```

**Время реализации**: 2-3 часа
**Риск**: Низкий
**Затраты**: Время на настройку

---

## P4: Frontend улучшения

### 5.1. Добавление TypeScript типов для Zustand

**Проблема**: Нет строгой типизации для состояния

**Шаги**:

1. **Создать `frontend/lib/types/store.ts`**:
   ```typescript
   import { StateCreator } from 'zustand'

   export interface CartItem {
     id: string
     article: string
     name: string
     price: number
     quantity: number
     currency?: string
   }

   export interface CartStore {
     items: CartItem[]
     total: number
     addItem: (item: Omit<CartItem, 'id'>) => void
     removeItem: (id: string) => void
     updateQuantity: (id: string, quantity: number) => void
     clearCart: () => void
   }

   export interface AuthStore {
     isAuthenticated: boolean
     user: {
       id: number
       email: string
       role: string
       avatar_index: number
     } | null
     login: (email: string, password: string) => Promise<void>
     logout: () => void
   }

   export const createCartSlice: StateCreator<CartStore, [], [], CartStore> = (
     set,
     get
   ) => ({
     items: [],
     total: 0,
     addItem: (item) => {
       const items = get().items
       const existing = items.find(i => i.article === item.article)

       if (existing) {
         set({
           items: items.map(i =>
             i.article === item.article
               ? { ...i, quantity: i.quantity + 1 }
               : i
           )
         })
       } else {
         set({
           items: [...items, { ...item, id: crypto.randomUUID() }]
         })
       }
     },
     removeItem: (id) => {
       set({ items: get().items.filter(i => i.id !== id) })
     },
     updateQuantity: (id, quantity) => {
       set({
         items: get().items.map(i =>
           i.id === id ? { ...i, quantity } : i
         )
       })
     },
     clearCart: () => set({ items: [], total: 0 })
   })

   export const createAuthSlice: StateCreator<AuthStore, [], [], AuthStore> = (
     set
   ) => ({
     isAuthenticated: false,
     user: null,
     login: async (email, password) => {
       // TODO: Реализация логина
     },
     logout: () => set({ isAuthenticated: false, user: null })
   })
   ```

2. **Обновить хуки для использования TypeScript**:
   ```typescript
   // frontend/hooks/useAuthStore.ts
   import { create } from 'zustand'
   import { createAuthSlice } from '@/lib/types/store'

   export const useAuthStore = create<AuthStore>()(
     createAuthSlice
   )
   ```

**Время реализации**: 3-4 часа
**Риск**: Низкий
**Затраты**: Время на рефакторинг

---

### 5.2. Добавить React Query types

**Шаги**:

1. **Создать `frontend/lib/types/query.ts`**:
   ```typescript
   export interface ApiError {
     status: number
     message: string
     detail?: any
   }

   export interface ApiResponse<T> {
     status: string
     data?: T
     message?: string
     error?: string
   }

   export interface PaginatedResponse<T> {
     items: T[]
     total: number
     page: number
     page_size: number
     total_pages: number
   }

   export type QueryKey = any
   export type QueryFn = () => Promise<any>
   ```

2. **Создать `frontend/lib/api/types.ts`**:
   ```typescript
   import { z } from 'zod'

   // Примеры схем валидации
   export const PartSchema = z.object({
     id: z.number(),
     article: z.string(),
     name: z.string(),
     brand: z.string(),
     price: z.number(),
     quantity: z.number().optional(),
     supplier_name: z.string().optional(),
   })

   export const UserSchema = z.object({
     id: z.number(),
     email: z.string().email(),
     first_name: z.string(),
     role: z.string(),
   })

   export const OrderSchema = z.object({
     id: z.number(),
     status: z.string(),
     total: z.number(),
     created_at: z.string(),
   })
   ```

**Время реализации**: 2-3 часа
**Риск**: Низкий
**Затраты**: Время на рефакторинг

---

### 5.3. Добавить проверку типов для fetch calls

**Шаги**:

1. **Создать `frontend/lib/api/types.ts`**:
   ```typescript
   export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

   export interface RequestOptions {
     method?: HttpMethod
     headers?: Record<string, string>
     body?: any
   }

   export interface ApiClientConfig {
     baseURL: string
     defaultHeaders?: Record<string, string>
   }
   ```

2. **Создать `frontend/lib/api/client.ts`**:
   ```typescript
   import type {
     RequestOptions,
     ApiClientConfig,
   } from './types'

   class ApiClient {
     constructor(private config: ApiClientConfig) {}

     private async request<T = any>(
       endpoint: string,
       options: RequestOptions = {}
     ): Promise<T> {
       const { baseURL } = this.config
       const { method = 'GET', headers = {}, body } = options

       const response = await fetch(`${baseURL}${endpoint}`, {
         method,
         headers: {
           'Content-Type': 'application/json',
           ...headers,
         },
         body: body ? JSON.stringify(body) : undefined,
       })

       if (!response.ok) {
         const error = await response.json()
         throw new Error(error.message || 'API request failed')
       }

       return response.json()
     }

     get<T = any>(endpoint: string, options?: RequestOptions) {
       return this.request<T>(endpoint, { ...options, method: 'GET' })
     }

     post<T = any>(endpoint: string, body: any, options?: RequestOptions) {
       return this.request<T>(endpoint, { ...options, method: 'POST', body })
     }

     put<T = any>(endpoint: string, body: any, options?: RequestOptions) {
       return this.request<T>(endpoint, { ...options, method: 'PUT', body })
     }

     delete<T = any>(endpoint: string, options?: RequestOptions) {
       return this.request<T>(endpoint, { ...options, method: 'DELETE' })
     }
   }

   export const apiClient = new ApiClient({
     baseURL: process.env.INTERNAL_API_URL || 'http://localhost:8080/api/v1',
   })
   ```

**Время реализации**: 3-4 часа
**Риск**: Низкий
**Затраты**: Время на рефакторинг

---

## P5: Производительность

### 6.1. Добавить indexing для БД

**Проблема**: Отсутствие индексов для частых запросов

**Шаги**:

1. **Добавить индексы в модели**:
   ```python
   # backend/app/models/auth.py
   from sqlalchemy import Column, Integer, String
   from sqlalchemy.orm import DeclarativeBase

   class User(Base):
       __tablename__ = 'users'

       id = Column(Integer, primary_key=True)
       email = Column(String(255), unique=True, index=True, nullable=False)
       password_hash = Column(String(255), nullable=False)
       first_name = Column(String(100), nullable=False)
       created_at = Column(DateTime, default=datetime.utcnow, index=True)

   # backend/app/models/orders.py
   from sqlalchemy import ForeignKey, Index

   class Order(Base):
       # ... другие поля

       user_id = Column(Integer, ForeignKey('users.id'), index=True)
       status = Column(String(50), index=True)
       created_at = Column(DateTime, default=datetime.utcnow, index=True)

       __table_args__ = (
           Index('idx_order_user_status', 'user_id', 'status'),
           Index('idx_order_status_created', 'status', 'created_at'),
       )
   ```

2. **Создать миграцию для добавления индексов**:
   ```bash
   cd backend
   alembic revision -m "add_performance_indexes"
   alembic upgrade head
   ```

**Время реализации**: 2-3 часа
**Риск**: Низкий
**Затраты**: Время на создание миграций

---

### 6.2. Добавить caching

**Проблема**: Дублирующиеся запросы к TecDoc API и БД

**Шаги**:

1. **Добавить Redis caching для каталога**:
   ```python
   # backend/app/services/cache_service.py
   from app.core.config import settings
   from app.core.db import get_db, get_tecdoc_db
   from sqlalchemy.orm import Session
   from redis import Redis
   import json

   redis_client = Redis(
       host=settings.REDIS_HOST,
       port=settings.REDIS_PORT,
       decode_responses=True,
   )

   def cache_get(key: str) -> any:
       cached = redis_client.get(key)
       return json.loads(cached) if cached else None

   def cache_set(key: str, value: any, expire: int = 3600):
       redis_client.setex(key, expire, json.dumps(value))

   def get_catalog_brand(db: Session, brand_id: int) -> dict:
       cache_key = f"catalog:brand:{brand_id}"
       cached = cache_get(cache_key)

       if cached:
           return cached

       brand = db.query(VehicleBrand).get(brand_id)
       if not brand:
           return None

       result = {"id": brand.id, "name": brand.name}
       cache_set(cache_key, result)
       return result
   ```

2. **Добавить кэширование для статистики админки**:
   ```python
   # backend/app/api/v1/endpoints/admin/dashboard.py
   from app.services.cache_service import cache_get, cache_set

   @router.get("/dashboard")
   async def get_dashboard_stats(db: Session = Depends(get_db)):
       cache_key = "admin:dashboard:stats"

       cached = cache_get(cache_key)
       if cached:
           return cached

       # Получаем статистику
       stats = {
           "total_orders": db.query(Order).count(),
           "total_revenue": db.query(Order).filter(Order.status == "completed").sum(),
           "total_users": db.query(User).count(),
       }

       cache_set(cache_key, stats, expire=300)  # Кэшировать на 5 минут
       return stats
   ```

**Время реализации**: 4-6 часов
**Риск**: Средний
**Затраты**: Время на настройку кэширования

---

## P6: Monitoring и логирование

### 7.1. Добавить Sentry для ошибок

**Шаги**:

1. **Добавить зависимость**:
   ```python
   # backend/requirements.txt
   sentry-sdk[fastapi]==2.0.0
   ```

2. **Настроить Sentry**:
   ```python
   # backend/app/main.py
   import sentry_sdk
   from app.core.config import settings

   sentry_sdk.init(
       dsn=settings.SENTRY_DSN,
       traces_sample_rate=1.0,
       profiles_sample_rate=1.0,
   )
   ```

3. **Добавить environment variable**:
   ```bash
   # .env
   SENTRY_DSN=https://your-sentry-dsn@example.com/123
   ```

**Время реализации**: 1-2 часа
**Риск**: Низкий
**Затраты**: Время на настройку

---

### 7.2. Добавить логирование для всех эндпоинтов

**Шаги**:

1. **Добавить logging middleware** (уже создан в P2):
   ```python
   # backend/app/core/middleware.py
   import logging
   from fastapi import Request
   from starlette.middleware.base import BaseHTTPMiddleware

   logger = logging.getLogger(__name__)

   class LoggingMiddleware(BaseHTTPMiddleware):
       async def dispatch(self, request: Request, call_next):
           logger.info(f"Request: {request.method} {request.url.path}")
           response = await call_next(request)
           logger.info(f"Response: {request.method} {request.url.path} - {response.status_code}")
           return response
   ```

2. **Добавить логирование для API endpoints**:
   ```python
   import logging

   logger = logging.getLogger(__name__)

   @router.get("/catalog/makes")
   async def get_makes(db: Session = Depends(get_db)):
       logger.info("Getting all vehicle makes")
       makes = db.query(VehicleBrand).all()
       logger.info(f"Returned {len(makes)} makes")
       return makes
   ```

**Время реализации**: 2-3 часа
**Риск**: Низкий
**Затраты**: Время на добавление логов

---

## P7: Документация

### 8.1. Добавить Swagger UI для API

**Шаги**:

1. **FastAPI автоматически генерирует Swagger UI**, но можно настроить его:
   ```python
   # backend/app/main.py
   from fastapi.openapi.docs import get_swagger_ui_html

   app = FastAPI(
       title=settings.PROJECT_NAME,
       openapi_url=f"{settings.API_V1_STR}/openapi.json",
       version="1.0.0",
       docs_url="/docs",
       redoc_url="/redoc",
   )

   @app.get("/docs", include_in_schema=False)
   async def custom_swagger_ui_html():
       return get_swagger_ui_html(
           openapi_url=app.openapi_url,
           title=settings.PROJECT_NAME + " API Docs",
       )

   @app.get("/redoc", include_in_schema=False)
   async def custom_redoc_html():
       return get_redoc_html(
           openapi_url=app.openapi_url,
           title=settings.PROJECT_NAME + " API Docs",
       )
   ```

2. **Добавить описание для endpoints**:
   ```python
   @router.get("/catalog/makes", response_model=List[BrandSchema], tags=["Catalog"])
   async def get_makes(
       db: Session = Depends(get_db),
       page: int = Query(1, ge=1, description="Page number"),
       per_page: int = Query(20, ge=1, le=100, description="Items per page"),
   ):
       """
       Получить все бренды автомобилей.

       - **page**: Номер страницы (начиная с 1)
       - **per_page**: Количество брендов на странице

       Возвращает список брендов с информацией о них.
       """
       # ... implementation
   ```

**Время реализации**: 2-3 часа
**Риск**: Низкий
**Затраты**: Время на добавление описаний

---

### 8.2. Создать документацию для frontend

**Шаги**:

1. **Добавить README для API**:
   ```markdown
   # Auto Parts Store API

   ## Базовый URL
   - Development: http://localhost:8080/api/v1
   - Production: https://api.example.com/api/v1

   ## Authentication
   Авторизация через JWT токен в заголовке:
   ```
   Authorization: Bearer {token}
   ```

   ## Endpoints

   ### Auth
   - `POST /api/v1/auth/register` - Регистрация
   - `POST /api/v1/auth/login` - Логин
   - `POST /api/v1/auth/google` - Google Auth

   ### Catalog
   - `GET /api/v1/catalog/makes` - Получить бренды
   - `GET /api/v1/catalog/models/{brand_id}` - Получить модели
   - `GET /api/v1/catalog/modifications/{model_id}` - Получить модификации

   ### Orders
   - `GET /api/v1/orders` - Получить список заказов
   - `POST /api/v1/orders/checkout` - Оформить заказ
   ```

2. **Добавить документацию для компонентов**:
   ```typescript
   /**
   * @component CatalogFilters
   * @description Компонент для фильтрации каталога запчастей
   * @param brands - Массив брендов
   * @param onFilter - Callback для обработки фильтрации
   */
   export function CatalogFilters({ brands, onFilter }: CatalogFiltersProps) {
       // ... implementation
   }
   ```

**Время реализации**: 3-4 часа
**Риск**: Низкий
**Затраты**: Время на написание документации

---

## Сводка по приоритетам

| Приоритет | Название задачи | Время | Риск | Стоимость |
|-----------|----------------|-------|------|-----------|
| **P0** | Замена SHA256 на bcrypt | 2-3 ч | Низкий | Низкая |
| **P0** | Удаление API ключей | 2-4 ч | Средний | Низкая |
| **P0** | Backend тесты | 8-12 ч | Средний | Средняя |
| **P0** | Frontend тесты | 8-10 ч | Средний | Средняя |
| **P1** | Middleware и exceptions | 3-4 ч | Низкий | Низкая |
| **P1** | Интеграционные тесты | 4-6 ч | Низкий | Средняя |
| **P1** | Улучшение структуры API | 4-6 ч | Средний | Средняя |
| **P1** | CI/CD | 4-6 ч | Средний | Средняя |
| **P2** | Health check и monitoring | 2-3 ч | Низкий | Низкая |
| **P3** | TypeScript типы для Zustand | 3-4 ч | Низкий | Низкая |
| **P3** | TypeScript типы для React Query | 2-3 ч | Низкий | Низкая |
| **P3** | Проверка типов для fetch | 3-4 ч | Низкий | Низкая |
| **P4** | DB индексы | 2-3 ч | Низкий | Низкая |
| **P4** | Caching | 4-6 ч | Средний | Средняя |
| **P5** | Sentry | 1-2 ч | Низкий | Низкая |
| **P5** | Логирование | 2-3 ч | Низкий | Низкая |
| **P6** | Swagger UI | 2-3 ч | Низкий | Низкая |
| **P6** | Frontend документация | 3-4 ч | Низкий | Низкая |

**Общее время**: ~55-85 часов
**Общая стоимость**: Средняя

---

## Мини-план: Быстрое решение критических проблем (P0)

**Цель**: Устранить критические уязвимости за один день

### Шаги:
1. **30 минут** - Заменить SHA256 на bcrypt в `auth.py`
2. **1 час** - Удалить API ключи из `opencode.json` и обновить конфиг
3. **4 часа** - Создать базовые тесты (auth + catalog)
4. **2 часа** - Настроить pytest.ini и запустить тесты
5. **1 час** - Настроить .env.example и gitignore
6. **2 часа** - Создать middleware для логирования

**Итого**: ~10.5 часов (1.5 рабочего дня)

---

## Безопасные процессы

### Хеширование паролей (шаги):
1. Обновить `requirements.txt`
2. Создать `security.py`
3. Обновить `auth.py`
4. Создать тесты
5. Запустить тесты
6. Переписать пароли существующих пользователей

### Удаление API ключей (шаги):
1. Создать `.env.example`
2. Обновить `config.py`
3. Обновить `docker-compose.yml`
4. Удалить API ключи из `opencode.json`
5. Добавить в `.gitignore`
6. Создать CI/CD secrets
7. Очистить git history (если нужно)

### Тестирование (шаги):
1. Добавить pytest в requirements
2. Создать `tests/conftest.py`
3. Создать `tests/test_auth.py`
4. Создать `tests/test_catalog.py`
5. Добавить pytest.ini
6. Запустить тесты
7. Проверить покрытие

---

## Финальные проверки

После реализации всех улучшений, нужно проверить:

1. **Безопасность**:
   - ✅ Пароли хешируются bcrypt
   - ✅ API ключи в .env
   - ✅ CORS настроен правильно
   - ✅ Все входные данные валидированы

2. **Тестирование**:
   - ✅ Backend покрытие >= 70%
   - ✅ Frontend покрытие >= 60%
   - ✅ Интеграционные тесты работают

3. **DevOps**:
   - ✅ CI/CD настроен
   - ✅ Health check работает
   - ✅ Docker Compose работает
   - ✅ Логирование настроено

4. **Производительность**:
   - ✅ Индексы добавлены
   - ✅ Кэширование работает

5. **Документация**:
   - ✅ Swagger UI доступен
   - ✅ README обновлен
   - ✅ Комменты в коде
