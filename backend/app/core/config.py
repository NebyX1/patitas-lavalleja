from functools import lru_cache
from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    environment: str = "development"
    database_url: str = "sqlite:///./data/patitas.sqlite3"
    public_site_url: str = "http://localhost:4321"
    backend_internal_url: str = "http://localhost:8010"
    cors_origins: str = "http://localhost:4321,http://127.0.0.1:4321"
    secret_key: str = ""
    cookie_secure: bool = False
    cookie_samesite: str = "lax"
    session_hours: int = Field(default=24, ge=1, le=168)
    media_dir: Path = Path("data/media")
    media_max_input_bytes: int = 12 * 1024 * 1024
    media_max_pixels: int = 24_000_000
    media_quota_bytes: int = 512 * 1024 * 1024
    lancedb_path: Path = Path("data/lance")
    model_cache_dir: Path = Path("data/models")
    ai_enabled: bool = False
    demo_login_enabled: bool = False
    rerank_enabled: bool = False
    embedding_backend: str = "openvino"
    embedding_model_id: str = "hotchpotch/bekko-embedding-v1-a8m"
    embedding_model_revision: str = "c721113d59a1d91b447450324f51c4b3332c924a"
    rerank_model_id: str = "Horizon-Labs/multilingual-reranker-small"
    rerank_model_revision: str = "c2ec8fb3e499725b168bbed2164bfee095360f77"
    ai_threads: int = Field(default=2, ge=1, le=8)
    ai_max_concurrent: int = Field(default=1, ge=1, le=2)
    rerank_pool_size: int = Field(default=12, ge=1, le=40)
    model_load_timeout: int = Field(default=120, ge=1, le=600)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_sender: str = ""
    smtp_starttls: bool = True
    index_poll_seconds: int = Field(default=10, ge=1, le=600)

    @property
    def allowed_origins(self) -> list[str]:
        return list(dict.fromkeys([self.public_site_url.rstrip("/"), *[x.strip().rstrip("/") for x in self.cors_origins.split(",") if x.strip()]]))

    @model_validator(mode="after")
    def validate_security(self):
        if self.demo_login_enabled and self.environment not in {"development", "testing"}:
            raise ValueError("Demo login is available exclusively in development/testing")
        if not self.database_url.startswith("sqlite:///"):
            raise ValueError("This deployment requires SQLite.")
        if self.cookie_samesite not in {"lax", "strict", "none"}:
            raise ValueError("Invalid SameSite policy")
        if self.cookie_samesite == "none" and not self.cookie_secure:
            raise ValueError("SameSite=None requires secure cookies")
        if self.environment == "production" and (len(self.secret_key) < 32 or not self.cookie_secure):
            raise ValueError("Production requires SECRET_KEY (32+ characters) and COOKIE_SECURE=true")
        if any("*" in origin or not origin.startswith(("http://", "https://")) for origin in self.allowed_origins):
            raise ValueError("CORS origins must be explicit HTTP(S) origins")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
