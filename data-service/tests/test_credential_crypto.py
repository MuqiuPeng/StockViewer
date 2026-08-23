"""
Tests for credential encryption and the stored-credential parser.

The database is not touched here: these cover the parts that decide whether a
stored secret is usable, which is where a mistake would be silent.

    python -m unittest discover -s tests -v
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.credentials.crypto import (  # noqa: E402
    CredentialCryptoError,
    decrypt,
    encrypt,
    generate_key,
)
from app.credentials.models import BudgetKind, Window  # noqa: E402
from app.credentials.store import _parse_budgets  # noqa: E402


class TestRoundTrip(unittest.TestCase):
    def setUp(self):
        self.key = generate_key()

    def test_a_secret_survives_the_round_trip(self):
        self.assertEqual(decrypt(encrypt("abc123", self.key), self.key), "abc123")

    def test_the_plaintext_does_not_appear_in_the_ciphertext(self):
        secret = "tiingo-live-key-do-not-leak"
        self.assertNotIn(secret, encrypt(secret, self.key))

    def test_two_encryptions_of_one_secret_differ(self):
        # A fresh nonce each time, so identical keys do not produce identical
        # rows that reveal which providers share a secret.
        a = encrypt("same", self.key)
        b = encrypt("same", self.key)
        self.assertNotEqual(a, b)
        self.assertEqual(decrypt(a, self.key), decrypt(b, self.key))

    def test_unicode_secrets_survive(self):
        self.assertEqual(decrypt(encrypt("密钥-ü-🔑", self.key), self.key), "密钥-ü-🔑")


class TestTampering(unittest.TestCase):
    def setUp(self):
        self.key = generate_key()
        self.blob = encrypt("abc123", self.key)

    def test_a_modified_value_fails_authentication(self):
        # GCM is authenticated so this surfaces here, not later as a puzzling
        # provider auth error.
        tampered = self.blob[:-4] + ("AAAA" if not self.blob.endswith("AAAA") else "BBBB")
        with self.assertRaises(CredentialCryptoError):
            decrypt(tampered, self.key)

    def test_the_wrong_key_is_rejected(self):
        with self.assertRaises(CredentialCryptoError):
            decrypt(self.blob, generate_key())

    def test_garbage_is_rejected(self):
        for value in ("", "not-base64!!", "aGVsbG8="):
            with self.assertRaises(CredentialCryptoError):
                decrypt(value, self.key)


class TestKeyValidation(unittest.TestCase):
    def test_a_short_key_is_refused(self):
        import base64
        short = base64.b64encode(b"too-short").decode()
        with self.assertRaises(CredentialCryptoError) as ctx:
            encrypt("x", short)
        self.assertIn("32 bytes", str(ctx.exception))

    def test_a_non_base64_key_is_refused(self):
        with self.assertRaises(CredentialCryptoError):
            encrypt("x", "not base64 at all !!")

    def test_an_empty_secret_is_refused(self):
        # Encrypting "" would store something that decrypts to a falsy key and
        # then fails at the provider for no visible reason.
        with self.assertRaises(CredentialCryptoError):
            encrypt("", generate_key())


class TestBudgetParsing(unittest.TestCase):
    def test_valid_budgets_are_parsed(self):
        budgets = _parse_budgets([
            {"kind": "requests", "limit": 50, "window": "hour"},
            {"kind": "symbols", "limit": 500, "window": "month"},
        ])
        self.assertEqual(len(budgets), 2)
        self.assertIs(budgets[0].kind, BudgetKind.REQUESTS)
        self.assertIs(budgets[1].window, Window.MONTH)

    def test_a_json_string_is_accepted(self):
        budgets = _parse_budgets('[{"kind": "requests", "limit": 25, "window": "day"}]')
        self.assertEqual(budgets[0].limit, 25)

    def test_one_bad_entry_does_not_discard_the_good_ones(self):
        # Dropping a limit is safer than dropping the key that is currently
        # serving traffic.
        budgets = _parse_budgets([
            {"kind": "requests", "limit": 50, "window": "hour"},
            {"kind": "nonsense", "limit": 1, "window": "day"},
            {"kind": "requests", "limit": "not a number", "window": "day"},
            {"kind": "bytes", "limit": 100, "window": "month"},
        ])
        self.assertEqual([b.kind for b in budgets],
                         [BudgetKind.REQUESTS, BudgetKind.BYTES])

    def test_malformed_json_yields_no_budgets_rather_than_raising(self):
        self.assertEqual(_parse_budgets("{not json"), [])
        self.assertEqual(_parse_budgets(None), [])
        self.assertEqual(_parse_budgets(42), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
