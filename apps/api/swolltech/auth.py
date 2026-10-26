import time
from uuid import UUID

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from swolltech.config import Settings, get_settings
from swolltech.errors import DomainError

bearer = HTTPBearer(auto_error=False)
_jwks_clients: dict[str, PyJWKClient] = {}
DECODE_OPTIONS = {"require": ["exp", "sub"]}
DEV_TOKEN_SECONDS = 12 * 3600


def decode_token(token: str, settings: Settings) -> dict:
    header = jwt.get_unverified_header(token)
    algorithm = header.get("alg")
    if algorithm == "HS256":
        if not settings.supabase_jwt_secret:
            raise DomainError(401, "Invalid token")
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
            options=DECODE_OPTIONS,
            leeway=30,
        )
    jwks_url = settings.supabase_jwks_url or (
        f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json" if settings.supabase_url else ""
    )
    if not jwks_url:
        raise DomainError(401, "Invalid token")
    client = _jwks_clients.get(jwks_url)
    if client is None:
        client = PyJWKClient(jwks_url)
        _jwks_clients[jwks_url] = client
    key = client.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        key.key,
        algorithms=["ES256", "RS256"],
        audience="authenticated",
        options=DECODE_OPTIONS,
        leeway=30,
    )


def mint_dev_token(user_id: UUID, settings: Settings) -> str:
    if not settings.supabase_jwt_secret:
        raise DomainError(500, "Dev tokens require SUPABASE_JWT_SECRET")
    return jwt.encode(
        {
            "sub": str(user_id),
            "aud": "authenticated",
            "role": "authenticated",
            "exp": int(time.time()) + DEV_TOKEN_SECONDS,
        },
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )


async def current_user_id(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    settings: Settings = Depends(get_settings),
) -> UUID:
    if creds is None:
        raise DomainError(401, "Missing token")
    try:
        payload = decode_token(creds.credentials, settings)
    except DomainError:
        raise
    except jwt.PyJWTError as exc:
        raise DomainError(401, "Invalid token") from exc
    subject = payload.get("sub")
    if not subject:
        raise DomainError(401, "Invalid token")
    try:
        return UUID(subject)
    except ValueError as exc:
        raise DomainError(401, "Invalid token") from exc
