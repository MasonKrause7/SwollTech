"""Neon Auth signs user tokens with EdDSA (Ed25519); iss and aud are the origin of the
auth URL. These tests sign tokens the same way so a missing crypto backend, a wrong
issuer/audience check or a broken JWKS path fails here, not in production."""

import time
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ed25519

from swolltech import auth
from swolltech.config import Settings, get_settings
from swolltech.main import app
from tests.conftest import headers, make_user

BASE_URL = "https://ep-test-123.neonauth.us-west-2.aws.neon.tech/neondb/auth"
ORIGIN = "https://ep-test-123.neonauth.us-west-2.aws.neon.tech"
JWKS_URL = f"{BASE_URL}/.well-known/jwks.json"
KID = "test-ed25519-key"


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
def neon(monkeypatch):
    private_key = ed25519.Ed25519PrivateKey.generate()
    monkeypatch.setitem(auth._jwks_clients, JWKS_URL, FakeJWKClient(private_key.public_key()))
    settings = Settings(_env_file=None, neon_auth_base_url=BASE_URL, dev_jwt_secret="", database_url=get_settings().database_url)
    app.dependency_overrides[get_settings] = lambda: settings
    yield private_key, settings
    app.dependency_overrides.pop(get_settings, None)


def sign(private_key, sub, kid=KID, **extra):
    now = int(time.time())
    claims = {"sub": str(sub), "iss": ORIGIN, "aud": ORIGIN, "iat": now, "exp": now + 900, "email": "a@b.test", "role": "user", **extra}
    return jwt.encode(claims, private_key, algorithm="EdDSA", headers={"kid": kid})


def test_settings_derive_jwks_and_issuer_from_the_base_url():
    settings = Settings(_env_file=None, neon_auth_base_url=BASE_URL + "/")
    assert settings.jwks_url == JWKS_URL
    assert settings.token_issuer == ORIGIN


def test_neon_tokens_decode(neon):
    private_key, settings = neon
    user = uuid.uuid4()
    assert auth.decode_token(sign(private_key, user), settings)["sub"] == str(user)


def test_rejects_unknown_key_tampering_expiry_and_wrong_issuer_or_audience(neon):
    private_key, settings = neon
    with pytest.raises(jwt.PyJWTError):
        auth.decode_token(sign(private_key, uuid.uuid4(), kid="other"), settings)
    with pytest.raises(jwt.PyJWTError):
        auth.decode_token(sign(ed25519.Ed25519PrivateKey.generate(), uuid.uuid4()), settings)
    with pytest.raises(jwt.PyJWTError):
        auth.decode_token(sign(private_key, uuid.uuid4(), exp=int(time.time()) - 600), settings)
    with pytest.raises(jwt.PyJWTError):
        auth.decode_token(sign(private_key, uuid.uuid4(), iss="https://evil.example"), settings)
    with pytest.raises(jwt.PyJWTError):
        auth.decode_token(sign(private_key, uuid.uuid4(), aud="https://evil.example"), settings)


def test_dev_tokens_are_refused_when_neon_auth_is_the_only_verifier(neon):
    _private_key, settings = neon
    dev = jwt.encode({"sub": str(uuid.uuid4()), "aud": "swolltech-dev", "exp": int(time.time()) + 60}, "x" * 40, algorithm="HS256")
    with pytest.raises(Exception) as caught:
        auth.decode_token(dev, settings)
    assert getattr(caught.value, "status", None) == 401


@pytest.mark.asyncio
async def test_api_accepts_neon_tokens_and_creates_the_profile(client, neon):
    private_key, _settings = neon
    user_id = uuid.uuid4()
    response = await client.get("/v1/me", headers=headers(sign(private_key, user_id, name="Sam Lifter")))
    assert response.status_code == 200
    assert response.json()["id"] == str(user_id)
    assert response.json()["display_name"] == "Sam Lifter"


@pytest.mark.asyncio
async def test_a_deleted_account_cannot_come_back_with_a_still_valid_token(client, neon):
    private_key, _settings = neon
    user_id, _token = await make_user()
    token = sign(private_key, user_id)
    assert (await client.get("/v1/me", headers=headers(token))).status_code == 200
    assert (await client.delete("/v1/me", headers=headers(token))).status_code == 204
    # The JWT is still unexpired, but the tombstone keeps the account closed.
    assert (await client.get("/v1/me", headers=headers(token))).status_code == 401
    assert (await client.post("/v1/workouts", json={"name": "Ghost"}, headers=headers(token))).status_code == 401


@pytest.mark.asyncio
async def test_banned_users_are_refused(client, neon):
    private_key, _settings = neon
    assert (await client.get("/v1/me", headers=headers(sign(private_key, uuid.uuid4(), banned=True)))).status_code == 401
