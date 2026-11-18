import os
from functools import lru_cache
from urllib.parse import urlparse

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = ""
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    supabase_jwks_url: str = ""
    service_role_key: str = ""
    cors_origins: str = "http://localhost:5173"
    s3_bucket: str = ""
    s3_region: str = "us-east-1"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_endpoint_url: str = ""
    media_max_bytes: int = 100 * 1024 * 1024
    presign_expires_seconds: int = 300
    sentry_dsn: str = ""
    dev_token_enabled: bool = False
    # Path to the Supabase root CA (Dashboard > Database > SSL). When set, the database
    # certificate and host name are verified. When unset, the link is encrypted but not verified.
    database_ssl_root_cert: str = ""
    db_pool_size: int = 5
    db_max_overflow: int = 5
    db_command_timeout_seconds: float = 15

    @property
    def is_deployed(self) -> bool:
        """True on a real host (Fly sets FLY_APP_NAME). Local runs and tests are not deployed."""
        return bool(os.environ.get("FLY_APP_NAME") or os.environ.get("SWOLLTECH_DEPLOYED"))

    @property
    def database_is_local(self) -> bool:
        host = urlparse(self.database_url.replace("+asyncpg", "")).hostname or ""
        return host in {"localhost", "127.0.0.1", "::1", "db", "test-db", "postgres"}

    @property
    def dev_tokens_allowed(self) -> bool:
        """Dev sign-in mints a token for any email, so it only ever works locally against a local database."""
        return self.dev_token_enabled and self.database_is_local and not self.is_deployed

    def problems(self) -> list[str]:
        """Settings that would make the API unsafe or broken. Startup refuses to continue with any."""
        found = []
        if not self.database_url:
            found.append("DATABASE_URL is not set")
        if not (self.supabase_jwt_secret or self.supabase_jwks_url or self.supabase_url):
            found.append("No way to verify tokens: set SUPABASE_URL or SUPABASE_JWKS_URL (or SUPABASE_JWT_SECRET for legacy projects)")
        if self.dev_token_enabled and not self.dev_tokens_allowed:
            found.append("DEV_TOKEN_ENABLED is only allowed on a local machine against a local database")
        if self.is_deployed:
            local = [origin for origin in self.cors_origin_list if "localhost" in origin or "127.0.0.1" in origin]
            if not self.cors_origin_list or len(local) == len(self.cors_origin_list):
                found.append("CORS_ORIGINS must list the production web origin")
        if self.database_ssl_root_cert and not os.path.isfile(self.database_ssl_root_cert):
            found.append(f"DATABASE_SSL_ROOT_CERT does not exist: {self.database_ssl_root_cert}")
        return found

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
