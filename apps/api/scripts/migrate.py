"""Apply the SQL files in apps/api/migrations to a database, in order, once each.

    # Neon: use the direct (unpooled) URL. Vercel's Neon integration sets DATABASE_URL_UNPOOLED.
    MIGRATION_DATABASE_URL=postgresql://... uv run python -m scripts.migrate
    uv run python -m scripts.migrate --status

Each file runs in its own transaction and is recorded in public.schema_migrations.
A Postgres advisory lock keeps two runs (say, two CI jobs) from racing.
"""

import argparse
import asyncio
import os
import sys
from pathlib import Path

import asyncpg

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"
LOCK_ID = 7_310_442_118  # any constant; shared by every runner of this script


def database_url() -> str:
    for key in ("MIGRATION_DATABASE_URL", "DATABASE_URL_UNPOOLED", "DATABASE_URL"):
        value = os.environ.get(key, "")
        if value:
            return value.replace("postgresql+asyncpg://", "postgresql://", 1)
    sys.exit("Set MIGRATION_DATABASE_URL (or DATABASE_URL_UNPOOLED) to the database to migrate.")


def migration_files() -> list[Path]:
    return sorted(MIGRATIONS.glob("*.sql"))


async def applied_versions(conn: asyncpg.Connection) -> set[str]:
    await conn.execute(
        """
        create table if not exists public.schema_migrations (
          version text primary key,
          applied_at timestamptz not null default now()
        )
        """
    )
    return {row["version"] for row in await conn.fetch("select version from public.schema_migrations")}


async def run(status_only: bool) -> int:
    conn = await asyncpg.connect(database_url(), statement_cache_size=0)
    try:
        await conn.execute("select pg_advisory_lock($1)", LOCK_ID)
        done = await applied_versions(conn)
        pending = [path for path in migration_files() if path.name not in done]
        for path in migration_files():
            print(f"{'applied' if path.name in done else 'pending'}  {path.name}")
        if status_only:
            return 0
        for path in pending:
            async with conn.transaction():
                # No parameters, so asyncpg sends the file as one simple query (many statements).
                await conn.execute(path.read_text())
                await conn.execute("insert into public.schema_migrations (version) values ($1)", path.name)
            print(f"migrated {path.name}")
        if not pending:
            print("Database is up to date.")
        return 0
    finally:
        await conn.execute("select pg_advisory_unlock($1)", LOCK_ID)
        await conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--status", action="store_true", help="list applied and pending migrations without applying")
    args = parser.parse_args()
    sys.exit(asyncio.run(run(args.status)))


if __name__ == "__main__":
    main()
