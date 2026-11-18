import re
from pathlib import Path

import psycopg

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"
# A stand-in for the part of Neon Auth's neon_auth schema the API touches, so account
# deletion is exercised end to end. On Neon the real schema is managed by Neon Auth.
PRELUDE = """
create schema if not exists neon_auth;
create table if not exists neon_auth."user" (
  id uuid primary key,
  name text not null default '',
  email text not null
);
create table if not exists neon_auth.session (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid not null references neon_auth."user" (id) on delete cascade
);
"""
HOSTED_MARKERS = ("supabase.co", "pooler.supabase.com", "neon.tech")


def split_sql(script: str) -> list[str]:
    statements: list[str] = []
    buf: list[str] = []
    i = 0
    dollar = None
    in_single = False
    while i < len(script):
        if dollar:
            if script.startswith(dollar, i):
                buf.append(dollar)
                i += len(dollar)
                dollar = None
                continue
            buf.append(script[i])
            i += 1
            continue
        if in_single:
            buf.append(script[i])
            if script[i] == "'":
                if i + 1 < len(script) and script[i + 1] == "'":
                    buf.append(script[i + 1])
                    i += 2
                    continue
                in_single = False
            i += 1
            continue
        if script.startswith("--", i):
            newline = script.find("\n", i)
            i = len(script) if newline < 0 else newline + 1
            continue
        if script[i] == "'":
            in_single = True
            buf.append(script[i])
            i += 1
            continue
        if script[i] == "$":
            match = re.match(r"\$[A-Za-z0-9_]*\$", script[i:])
            if match:
                dollar = match.group(0)
                buf.append(dollar)
                i += len(dollar)
                continue
        if script[i] == ";":
            statement = "".join(buf).strip()
            if statement:
                statements.append(statement)
            buf = []
            i += 1
            continue
        buf.append(script[i])
        i += 1
    tail = "".join(buf).strip()
    if tail:
        statements.append(tail)
    return statements


def apply_schema(dsn: str) -> None:
    if any(marker in dsn for marker in HOSTED_MARKERS):
        raise RuntimeError("Refusing to rebuild a hosted database.")
    migration = "\n".join(path.read_text() for path in sorted(MIGRATIONS.glob("*.sql")))
    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute("drop schema if exists public cascade")
        conn.execute("drop schema if exists neon_auth cascade")
        conn.execute("drop schema if exists app_private cascade")
        conn.execute("create schema public")
        conn.execute("grant all on schema public to public")
        for statement in split_sql(PRELUDE + "\n" + migration):
            conn.execute(statement)
