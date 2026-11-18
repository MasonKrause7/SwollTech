"""Who is calling. Production tokens are Neon Auth (Better Auth) JWTs: EdDSA (Ed25519),
15-minute lifetime, issuer and audience equal to the origin of NEON_AUTH_BASE_URL,
subject = neon_auth.user.id (a uuid). Keys come from <base>/.well-known/jwks.json and
are cached. Locally and in tests, HS256 tokens signed with DEV_JWT_SECRET are accepted.
"""

import logging
import time
import uuid
from uuid import UUID

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from swolltech.config import Settings, get_settings
from swolltech.db import get_db
from swolltech.errors import DomainError

logger = logging.getLogger("swolltech.auth")
bearer = HTTPBearer(auto_error=False)
_jwks_clients: dict[str, PyJWKClient] = {}
DECODE_OPTIONS = {"require": ["exp", "sub", "iat"]}
DEV_TOKEN_SECONDS = 12 * 3600
DEV_AUDIENCE = "swolltech-dev"
# Dev sign-in derives a stable id from the email, so no local users table is needed.
DEV_NAMESPACE = uuid.UUID("5b0e7a52-6f0c-4c1e-9d55-2c0a7f3f9b11")
JWKS_CACHE_SECONDS = 3600
# Phones can be minutes off. Tokens live 15 minutes, so two minutes of slack in either
# direction costs little and keeps a skewed clock from looking like a lost session.
CLOCK_LEEWAY_SECONDS = 120


def _jwks_client(url: str) -> PyJWKClient:
    client = _jwks_clients.get(url)
    if client is None:
        # Keys are cached in memory for an hour; an unknown kid triggers one refetch.
        client = PyJWKClient(url, cache_keys=True, lifespan=JWKS_CACHE_SECONDS, timeout=5)
        _jwks_clients[url] = client
    return client


def decode_token(token: str, settings: Settings) -> dict:
    header = jwt.get_unverified_header(token)
    algorithm = header.get("alg")
    if algorithm == "HS256":
        # Only for local development and tests. Startup refuses DEV_JWT_SECRET on a deployed host.
        if not settings.dev_jwt_secret or settings.is_deployed:
            logger.warning("Rejected HS256 token: dev tokens are not enabled here")
            raise DomainError(401, "Invalid token")
        return jwt.decode(
            token,
            settings.dev_jwt_secret,
            algorithms=["HS256"],
            audience=DEV_AUDIENCE,
            options={"require": ["exp", "sub"]},
            leeway=CLOCK_LEEWAY_SECONDS,
        )
    if not settings.jwks_url or not settings.token_issuer:
        logger.warning("Rejected %s token: NEON_AUTH_BASE_URL is not configured", algorithm)
        raise DomainError(401, "Invalid token")
    key = _jwks_client(settings.jwks_url).get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        key.key,
        algorithms=["EdDSA"],
        audience=settings.token_issuer,
        issuer=settings.token_issuer,
        options=DECODE_OPTIONS,
        leeway=CLOCK_LEEWAY_SECONDS,
    )


def dev_user_id(email: str) -> UUID:
    return uuid.uuid5(DEV_NAMESPACE, email.strip().lower())


def mint_dev_token(user_id: UUID, settings: Settings, *, email: str = "", name: str = "") -> str:
    if not settings.dev_jwt_secret:
        raise DomainError(500, "Dev tokens require DEV_JWT_SECRET")
    now = int(time.time())
    return jwt.encode(
        {"sub": str(user_id), "aud": DEV_AUDIENCE, "iat": now, "exp": now + DEV_TOKEN_SECONDS, "email": email, "name": name},
        settings.dev_jwt_secret,
        algorithm="HS256",
    )


async def _ensure_profile(db: AsyncSession, user_id: UUID, payload: dict) -> bool:
    """Create the profile on a user's first request. Returns False if the account was closed."""
    if await db.scalar(text("select 1 from public.deleted_accounts where user_id = :id"), {"id": user_id}):
        return False
    email = str(payload.get("email") or "")
    display_name = str(payload.get("name") or "").strip() or email.split("@")[0]
    await db.execute(
        text("insert into public.profiles (id, display_name) values (:id, :name) on conflict (id) do nothing"),
        {"id": user_id, "name": display_name[:80]},
    )
    return True


async def current_user_id(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    settings: Settings = Depends(get_settings),
    db: AsyncSession = Depends(get_db),
) -> UUID:
    if creds is None:
        raise DomainError(401, "Missing token")
    try:
        payload = decode_token(creds.credentials, settings)
    except DomainError:
        raise
    except jwt.PyJWKClientConnectionError as exc:
        # Neon Auth's key set could not be fetched. The token may be fine, so this is our
        # outage, not a lost session: 401 would make clients sign the user out.
        logger.warning("Could not fetch the signing keys: %s", exc)
        raise DomainError(503, "Sign-in check is temporarily unavailable. Try again shortly.") from exc
    except jwt.PyJWTError as exc:
        alg = kid = None
        try:
            header = jwt.get_unverified_header(creds.credentials)
            alg, kid = header.get("alg"), header.get("kid")
        except jwt.PyJWTError:
            pass
        # Never log the token itself, only why it failed.
        logger.warning("Rejected token: %s: %s (alg=%s kid=%s)", type(exc).__name__, exc, alg, kid)
        raise DomainError(401, "Invalid token") from exc
    if payload.get("banned"):
        raise DomainError(401, "Account disabled")
    try:
        user_id = UUID(str(payload.get("sub") or ""))
    except ValueError as exc:
        raise DomainError(401, "Invalid token") from exc
    # Tokens stay valid until they expire, so a closed account's token must be refused on
    # every route, not just on /me.
    state = await db.scalar(
        text("select deleted_at is null from public.profiles where id = :id"),
        {"id": user_id},
    )
    if state is False:
        raise DomainError(401, "Account not found")
    if state is None and not await _ensure_profile(db, user_id, payload):
        raise DomainError(401, "Account not found")
    return user_id
