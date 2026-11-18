import os
from functools import lru_cache
from urllib.parse import urlparse

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Neon pooled connection string (Vercel's Neon integration sets DATABASE_URL).
    database_url: str = ""
    # Neon Auth, e.g. https://ep-x.neonauth.<region>.aws.neon.tech/neondb/auth. Set by the
    # Vercel Neon integration when Auth is on. Tokens are EdDSA JWTs whose issuer and
    # audience are this URL's origin; keys come from <base>/.well-known/jwks.json.
    neon_auth_base_url: str = ""
    neon_auth_jwks_url: str = ""
    # Local development and tests only: HS256 secret for /v1/dev/token and test tokens.
    # Refused on a deployed host.
    dev_jwt_secret: str = ""
    # Upstash Redis (Vercel Marketplace) for rate limits shared across function instances.
    kv_rest_api_url: str = ""
    kv_rest_api_token: str = ""
    upstash_redis_rest_url: str = ""
    upstash_redis_rest_token: str = ""
    cors_origins: str = "http://localhost:5173"
    # Optional regex for extra origins, e.g. this team's Vercel preview URLs of the web app.
    cors_origin_regex: str = ""
    s3_bucket: str = ""
    s3_region: str = "us-east-1"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_endpoint_url: str = ""
    media_max_bytes: int = 100 * 1024 * 1024
    presign_expires_seconds: int = 300
    sentry_dsn: str = ""
    dev_token_enabled: bool = False
    # Optional CA bundle for the database. Neon uses publicly trusted certificates, so the
    # system store verifies it by default; set this only for a private CA.
    database_ssl_root_cert: str = ""
    # Serverless functions run many small instances, and Neon's pooler does the pooling.
    db_pool_size: int = 2
    db_max_overflow: int = 3
    db_command_timeout_seconds: float = 15

    @property
    def is_deployed(self) -> bool:
        """True on a real host. Vercel sets VERCEL=1 and VERCEL_ENV on builds and functions
        (VERCEL_ENV=development only under `vercel dev`, which is local). Local runs and tests are not deployed."""
        if os.environ.get("SWOLLTECH_DEPLOYED"):
            return True
        vercel_env = os.environ.get("VERCEL_ENV", "")
        if vercel_env:
            return vercel_env != "development"
        return bool(os.environ.get("VERCEL"))

    @property
    def jwks_url(self) -> str:
        if self.neon_auth_jwks_url:
            return self.neon_auth_jwks_url
        if self.neon_auth_base_url:
            return f"{self.neon_auth_base_url.rstrip('/')}/.well-known/jwks.json"
        return ""

    @property
    def token_issuer(self) -> str:
        """Neon Auth sets both iss and aud to the origin of the auth URL (no path)."""
        parsed = urlparse(self.neon_auth_base_url)
        return f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else ""

    @property
    def redis_rest_url(self) -> str:
        return self.upstash_redis_rest_url or self.kv_rest_api_url

    @property
    def redis_rest_token(self) -> str:
        return self.upstash_redis_rest_token or self.kv_rest_api_token

    @property
    def database_is_local(self) -> bool:
        host = urlparse(self.database_url.replace("+asyncpg", "")).hostname or ""
        return host in {"localhost", "127.0.0.1", "::1", "db", "test-db", "postgres"}

    @property
    def dev_tokens_allowed(self) -> bool:
        """Dev sign-in mints a token for any email, so it only ever works locally against a local database."""
        return self.dev_token_enabled and bool(self.dev_jwt_secret) and self.database_is_local and not self.is_deployed

    def problems(self) -> list[str]:
        """Settings that would make the API unsafe or broken. Startup refuses to continue with any."""
        found = []
        if not self.database_url:
            found.append("DATABASE_URL is not set")
        if not (self.neon_auth_base_url or self.dev_jwt_secret):
            found.append("No way to verify tokens: set NEON_AUTH_BASE_URL (or DEV_JWT_SECRET locally)")
        if self.dev_token_enabled and not self.dev_tokens_allowed:
            found.append("DEV_TOKEN_ENABLED is only allowed on a local machine against a local database, with DEV_JWT_SECRET set")
        if self.is_deployed:
            if not self.neon_auth_base_url:
                found.append("NEON_AUTH_BASE_URL must be set on a deployed host")
            if self.dev_jwt_secret:
                found.append("DEV_JWT_SECRET must not be set on a deployed host")

            local = [origin for origin in self.cors_origin_list if "localhost" in origin or "127.0.0.1" in origin]
            if not self.cors_origin_list or len(local) == len(self.cors_origin_list):
                found.append("CORS_ORIGINS must list the production web origin")
        if self.database_ssl_root_cert and not os.path.isfile(self.database_ssl_root_cert):
            found.append(f"DATABASE_SSL_ROOT_CERT does not exist: {self.database_ssl_root_cert}")
        return found

    def warnings(self) -> list[str]:
        """Settings that work but should be fixed before real traffic."""
        found = []
        if self.is_deployed and not (self.redis_rest_url and self.redis_rest_token):
            found.append("No Upstash Redis (KV_REST_API_URL/KV_REST_API_TOKEN): rate limits are per function instance only")
        return found

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
