"""
Encryption for stored credentials.

Keys move from .env into the database so they can be rotated and expired
without editing a file, but a database holds different risks than a file: it
gets dumped, backed up, and read by the web app that shares it. Storing
ciphertext means none of those yield a working key on their own — the
plaintext exists only in the gateway's memory, and .env shrinks from N
provider keys to one encryption key.

AES-256-GCM, chosen because both sides need it. Python has it through
`cryptography` and Node has it natively in `crypto`, so an admin UI in the web
app can write credentials the gateway can read without either side
reimplementing a scheme.

Wire format is ``base64(nonce || ciphertext || tag)`` with a 12-byte nonce and
16-byte tag — the layout Node's `createCipheriv('aes-256-gcm')` produces when
the tag is appended, so the two implementations agree without negotiation.

GCM is authenticated: tampering with a stored value fails decryption rather
than yielding a subtly wrong key that presents as an auth error nobody traces
back to the database.
"""
from __future__ import annotations

import base64
import logging
import os
from typing import Optional

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

logger = logging.getLogger(__name__)

_NONCE_BYTES = 12
_KEY_BYTES = 32

ENV_KEY_NAME = "CREDENTIAL_ENCRYPTION_KEY"


class CredentialCryptoError(RuntimeError):
    """Encryption or decryption failed. Never carries key material."""


def generate_key() -> str:
    """A new base64 key, for putting in .env."""
    return base64.b64encode(os.urandom(_KEY_BYTES)).decode()


def _key_from_settings() -> str:
    """
    The configured key, via Settings so that .env is honoured.

    Imported lazily: this module is used by the standalone credential script,
    which must keep working even if application settings fail to construct.
    """
    try:
        from ..config import get_settings

        return getattr(get_settings(), "credential_encryption_key", "") or ""
    except Exception:  # pragma: no cover - settings are optional here
        return ""


def _load_key(key_b64: Optional[str] = None) -> bytes:
    raw = key_b64 if key_b64 is not None else (
        os.environ.get(ENV_KEY_NAME) or _key_from_settings()
    )
    if not raw:
        raise CredentialCryptoError(
            f"{ENV_KEY_NAME} is not set. Generate one with "
            f"`python -m app.credentials.crypto` and put it in .env; without it "
            f"stored credentials cannot be read."
        )
    try:
        key = base64.b64decode(raw, validate=True)
    except Exception as exc:
        raise CredentialCryptoError(f"{ENV_KEY_NAME} is not valid base64") from exc

    if len(key) != _KEY_BYTES:
        raise CredentialCryptoError(
            f"{ENV_KEY_NAME} must decode to {_KEY_BYTES} bytes, got {len(key)}"
        )
    return key


def encrypt(plaintext: str, key_b64: Optional[str] = None) -> str:
    """Encrypt a secret for storage. Returns base64(nonce || ct || tag)."""
    if not plaintext:
        raise CredentialCryptoError("refusing to encrypt an empty secret")

    key = _load_key(key_b64)
    nonce = os.urandom(_NONCE_BYTES)
    sealed = AESGCM(key).encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + sealed).decode()


def decrypt(stored: str, key_b64: Optional[str] = None) -> str:
    """
    Recover a secret from storage.

    A wrong key and a tampered value both surface here rather than as a
    provider authentication failure later, which is the point of using an
    authenticated mode.
    """
    if not stored:
        raise CredentialCryptoError("no ciphertext to decrypt")

    key = _load_key(key_b64)
    try:
        blob = base64.b64decode(stored, validate=True)
    except Exception as exc:
        raise CredentialCryptoError("stored credential is not valid base64") from exc

    if len(blob) <= _NONCE_BYTES:
        raise CredentialCryptoError("stored credential is too short to be valid")

    nonce, sealed = blob[:_NONCE_BYTES], blob[_NONCE_BYTES:]
    try:
        return AESGCM(key).decrypt(nonce, sealed, None).decode()
    except InvalidTag as exc:
        raise CredentialCryptoError(
            "stored credential failed authentication — either "
            f"{ENV_KEY_NAME} is wrong or the value was modified"
        ) from exc


def is_configured() -> bool:
    try:
        _load_key()
        return True
    except CredentialCryptoError:
        return False


if __name__ == "__main__":  # pragma: no cover - operator convenience
    print(generate_key())
