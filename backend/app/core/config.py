from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        env_prefix="AUTO_PARTS_",
    )

    PROJECT_NAME: str = "Auto Parts Store"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = Field(min_length=16)

    # Database
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = Field(min_length=1)
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "autoparts"
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10

    @property
    def DATABASE_URL(self) -> str:
        return f"postgresql+psycopg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    # Redis
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379

    # TecDoc API
    TECDOC_API_URL: str = "https://auto-db.pro/api/v1/"
    TECDOC_API_KEY: str = Field(min_length=1)
    TECDOC_API_SECRET: str = Field(min_length=1)
    TECDOC_REQUEST_TIMEOUT: int = 30

    # Rate Limiting
    TECDOC_MAX_ACTIONS_PER_HOUR: int = Field(default=3300, ge=1, le=10000)

    # Sentry
    SENTRY_DSN: str = ""

    # Resend (email)
    RESEND_API_KEY: str = ""

    # Telegram
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_WEBHOOK_URL: str = ""
    TELEGRAM_BOT_USERNAME: str = "SVOMBot"

    # Chat / Support
    CHAT_HISTORY_DAYS: int = 365

    # Protection / Rate Limiting
    PROTECTION_ENABLED: bool = True
    AUTO_BAN_ENABLED: bool = True
    RATE_LIMIT_PER_MINUTE: int = Field(default=120, ge=1, le=10000)
    RATE_LIMIT_PER_HOUR: int = Field(default=3000, ge=1, le=100000)
    RATE_LIMIT_PER_ENDPOINT: int = Field(default=60, ge=1, le=5000)
    FAILED_LOGIN_BAN_THRESHOLD: int = Field(default=10, ge=1, le=1000)
    AUTO_BAN_DURATION_MINUTES: int = Field(default=60, ge=0, le=525600)
    WHITELIST_BYPASS_LIMITS: bool = True
    TRUST_PRIVATE_IPS: bool = True

settings = Settings()
