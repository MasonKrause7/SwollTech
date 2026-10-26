import re
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[3]
MIGRATION = ROOT / "supabase" / "migrations" / "20261025020000_init.sql"
PRELUDE = """
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create table if not exists auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade
);
"""


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
    if "supabase.co" in dsn or "pooler.supabase.com" in dsn:
        raise RuntimeError("Refusing to rebuild a Supabase database.")
    migration = MIGRATION.read_text()
    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute("drop schema if exists public cascade")
        conn.execute("drop schema if exists auth cascade")
        conn.execute("drop schema if exists app_private cascade")
        conn.execute("create schema public")
        conn.execute("grant all on schema public to public")
        for statement in split_sql(PRELUDE + "\n" + migration):
            conn.execute(statement)
