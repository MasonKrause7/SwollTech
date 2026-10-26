"""Drop and rebuild the schema in a LOCAL database. Used by the end-to-end tests.

    DATABASE_URL=postgresql://postgres:postgres@localhost:54329/swolltech_e2e uv run python -m scripts.reset_local_db
"""

import os
import sys
from urllib.parse import urlparse

from tests.schema_loader import apply_schema

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "postgres", "db"}


def main() -> None:
    url = os.environ.get("DATABASE_URL", "")
    dsn = url.replace("postgresql+asyncpg://", "postgresql://", 1)
    host = urlparse(dsn).hostname or ""
    if host not in LOCAL_HOSTS:
        sys.exit(f"Refusing to reset {host or 'an unknown host'}. This only runs against a local database.")
    apply_schema(dsn)
    print(f"Schema rebuilt on {host}")


if __name__ == "__main__":
    main()
