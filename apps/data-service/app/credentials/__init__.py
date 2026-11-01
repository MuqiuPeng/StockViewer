"""Credential registry: per-key budgets, validity periods and rotation."""
from .crypto import CredentialCryptoError, decrypt, encrypt, generate_key, is_configured
from .models import Budget, BudgetKind, Credential, CredentialState, Window
from .pool import (
    CredentialLease, CredentialPool, NoCredentialAvailable,
    all_pools, get_pool, register_pool, reset_all,
)
from .store import load_credentials

__all__ = [
    "Budget", "BudgetKind", "Credential", "CredentialState", "Window",
    "CredentialLease", "CredentialPool", "NoCredentialAvailable",
    "all_pools", "get_pool", "register_pool", "reset_all",
    "CredentialCryptoError", "decrypt", "encrypt", "generate_key", "is_configured",
    "load_credentials",
]
