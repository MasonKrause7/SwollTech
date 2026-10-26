"""Supabase signs user tokens with ES256 (asymmetric). These tests sign tokens the
same way so a missing crypto backend or a broken JWKS path fails here, not in production."""

import time
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from swolltech import auth
from swolltech.config import Settings, get_settings
from swolltech.main import app
from tests.conftest import headers, make_user

JWKS_URL = "https://example.supabase.co/auth/v1/.well-known/jwks.json"
KID = "test-es256-key"


class FakeSigningKey:
    def __init__(self, key):
        self.key = key


class FakeJWKClient:
    def __init__(self, public_key):
        self.public_key = public_key

    def get_signing_key_from_jwt(self, token):
        if jwt.get_unverified_header(token).get("kid") != KID:
            raise jwt.PyJWKClientError("Unable to find a signing key that matches")
        return FakeSigningKey(self.public_key)


@pytest.fixture
def es256(monkeypatch):
    private_key = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setitem(auth._jwks_clients, JWKS_URL, FakeJWKClient(private_key.public_key()))
    settings = Settings(supabase_jwks_url=JWKS_URL, supabase_jwt_secret="", database_url=get_settings().database_url)
    app.dependency_overrides[get_settings] = lambda: settings
    yield private_key, settings
    app.dependency_overrides.pop(get_settings, None)


def sign(private_key, sub, kid=KID, **extra):
    claims = {"sub": str(sub), "aud": "authenticated", "role": "authenticated", "exp": int(time.time()) + 3600, **extra}
    return jwt.encode(claims, private_key, algorithm="ES256", headers={"kid": kid})


def test_es256_tokens_decode(es256):
    private_key, settings = es256
    user = uuid.uuid4()
    assert auth.decode_token(sign(private_key, user), settings)["sub"] == str(user)


def test_es256_rejects_unknown_key_and_tampering(es256):
    private_key, settings = es256
    with pytest.raises(jwt.PyJWTError):
        auth.decode_token(sign(private_key, uuid.uuid4(), kid="other"), settings)
    other = ec.generate_private_key(ec.SECP256R1())
    with pytest.raises(jwt.PyJWTError):
        auth.decode_token(sign(other, uuid.uuid4()), settings)
    with pytest.raises(jwt.PyJWTError):
        auth.decode_token(sign(private_key, uuid.uuid4(), exp=int(time.time()) - 600), settings)


@pytest.mark.asyncio
async def test_api_accepts_supabase_style_tokens(client, es256):
    private_key, _settings = es256
    user_id, _token = await make_user()
    response = await client.get("/v1/me", headers=headers(sign(private_key, user_id)))
    assert response.status_code == 200
    assert response.json()["id"] == str(user_id)
