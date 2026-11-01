#!/usr/bin/env python3
"""
Manage stored provider credentials.

Storing keys encrypted in a database is only an improvement if adding and
rotating one is easier than editing .env, which needs a tool. This is it.

    # once, then put the value in .env as CREDENTIAL_ENCRYPTION_KEY
    python scripts/credentials.py genkey

    python scripts/credentials.py list
    python scripts/credentials.py add tiingo primary --secret KEY \\
        --budget requests:50:hour --budget requests:1000:day \\
        --budget symbols:500:month --budget bytes:1073741824:month
    python scripts/credentials.py add itick trial --secret KEY \\
        --valid-until 2026-08-31
    python scripts/credentials.py rotate tiingo primary --secret NEW_KEY
    python scripts/credentials.py disable tiingo backup
    python scripts/credentials.py remove itick trial

Secrets are read from --secret or, preferably, from stdin with --secret-stdin,
which keeps them out of shell history.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402
from app.credentials.crypto import (  # noqa: E402
    CredentialCryptoError, decrypt, encrypt, generate_key, is_configured,
)


def connect():
    import psycopg

    url = get_settings().database_url
    if not url:
        sys.exit("DATABASE_URL is not set; nothing to connect to.")
    return psycopg.connect(url, connect_timeout=5)


def parse_budget(spec: str) -> dict:
    """kind:limit:window, e.g. requests:50:hour"""
    parts = spec.split(":")
    if len(parts) != 3:
        sys.exit(f"Bad budget {spec!r}; expected kind:limit:window")
    kind, limit, window = parts
    if kind not in ("requests", "credits", "bytes", "symbols"):
        sys.exit(f"Unknown budget kind {kind!r}")
    if window not in ("minute", "hour", "day", "month", "lifetime"):
        sys.exit(f"Unknown window {window!r}")
    try:
        return {"kind": kind, "limit": int(limit), "window": window}
    except ValueError:
        sys.exit(f"Budget limit must be a number, got {limit!r}")


def read_secret(args) -> str:
    if args.secret_stdin:
        secret = sys.stdin.read().strip()
    else:
        secret = args.secret or ""
    if not secret:
        sys.exit("No secret supplied. Use --secret or --secret-stdin.")
    return secret


def require_key() -> None:
    if not is_configured():
        sys.exit(
            "CREDENTIAL_ENCRYPTION_KEY is not set.\n"
            "Generate one with:  python scripts/credentials.py genkey\n"
            "then add it to .env. Stored credentials cannot be read without it."
        )


def cmd_genkey(_args) -> None:
    print(generate_key())
    print(
        "\nAdd this to .env as CREDENTIAL_ENCRYPTION_KEY.\n"
        "Keep it: without it every stored credential becomes unreadable, and "
        "changing it means re-adding them all.",
        file=sys.stderr,
    )


def cmd_list(_args) -> None:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            'SELECT provider, label, enabled, priority, "validFrom", "validUntil", '
            'budgets, "lastUsedAt", "secretCiphertext" '
            'FROM "ProviderCredential" ORDER BY provider, priority, label'
        )
        rows = cur.fetchall()

    if not rows:
        print("No stored credentials. Everything is coming from .env.")
        return

    key_ok = is_configured()
    today = datetime.now(timezone.utc).date()

    for (provider, label, enabled, priority, valid_from,
         valid_until, budgets, last_used, ciphertext) in rows:
        flags = [] if enabled else ["disabled"]
        if valid_until:
            days = (valid_until.date() if hasattr(valid_until, "date") else valid_until) - today
            flags.append("EXPIRED" if days.days < 0 else f"expires in {days.days}d")
        if key_ok:
            try:
                decrypt(ciphertext)
            except CredentialCryptoError:
                flags.append("UNDECRYPTABLE")
        else:
            flags.append("key not set, cannot verify")

        budget_list = budgets if isinstance(budgets, list) else json.loads(budgets or "[]")
        shown = ", ".join(
            f"{b['limit']} {b['kind']}/{b['window']}" for b in budget_list
        ) or "no budgets"

        print(f"{provider}/{label}  priority={priority}  {shown}"
              + (f"  [{', '.join(flags)}]" if flags else ""))
        if last_used:
            print(f"    last used {last_used}")


def cmd_add(args) -> None:
    require_key()
    secret = read_secret(args)
    budgets = [parse_budget(b) for b in (args.budget or [])]

    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            'INSERT INTO "ProviderCredential" '
            '(id, provider, label, "secretCiphertext", enabled, priority, '
            ' "validFrom", "validUntil", budgets, notes, "createdAt", "updatedAt") '
            "VALUES (gen_random_uuid()::text, %s, %s, %s, true, %s, %s, %s, %s::jsonb, %s, now(), now()) "
            'ON CONFLICT (provider, label) DO UPDATE SET '
            '  "secretCiphertext" = EXCLUDED."secretCiphertext", '
            "  priority = EXCLUDED.priority, "
            '  "validFrom" = EXCLUDED."validFrom", '
            '  "validUntil" = EXCLUDED."validUntil", '
            "  budgets = EXCLUDED.budgets, "
            "  notes = EXCLUDED.notes, "
            "  enabled = true, "
            '  "updatedAt" = now()',
            (args.provider, args.label, encrypt(secret), args.priority,
             args.valid_from, args.valid_until, json.dumps(budgets), args.notes),
        )
        conn.commit()
    print(f"Stored {args.provider}/{args.label}.")
    print("Restart the data-service to pick it up.")


def cmd_rotate(args) -> None:
    require_key()
    secret = read_secret(args)
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            'UPDATE "ProviderCredential" SET "secretCiphertext" = %s, "updatedAt" = now() '
            "WHERE provider = %s AND label = %s",
            (encrypt(secret), args.provider, args.label),
        )
        if cur.rowcount == 0:
            sys.exit(f"No credential {args.provider}/{args.label}.")
        conn.commit()
    print(f"Rotated {args.provider}/{args.label}. Restart the data-service.")


def _set_enabled(provider: str, label: str, enabled: bool) -> None:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            'UPDATE "ProviderCredential" SET enabled = %s, "updatedAt" = now() '
            "WHERE provider = %s AND label = %s",
            (enabled, provider, label),
        )
        if cur.rowcount == 0:
            sys.exit(f"No credential {provider}/{label}.")
        conn.commit()
    print(f"{'Enabled' if enabled else 'Disabled'} {provider}/{label}.")


def cmd_enable(args) -> None:
    _set_enabled(args.provider, args.label, True)


def cmd_disable(args) -> None:
    _set_enabled(args.provider, args.label, False)


def cmd_remove(args) -> None:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            'DELETE FROM "ProviderCredential" WHERE provider = %s AND label = %s',
            (args.provider, args.label),
        )
        if cur.rowcount == 0:
            sys.exit(f"No credential {args.provider}/{args.label}.")
        conn.commit()
    print(f"Removed {args.provider}/{args.label}.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("genkey", help="print a new encryption key").set_defaults(func=cmd_genkey)
    sub.add_parser("list", help="show stored credentials").set_defaults(func=cmd_list)

    def add_target(p):
        p.add_argument("provider")
        p.add_argument("label")

    p_add = sub.add_parser("add", help="add or replace a credential")
    add_target(p_add)
    p_add.add_argument("--secret")
    p_add.add_argument("--secret-stdin", action="store_true",
                       help="read the secret from stdin, keeping it out of shell history")
    p_add.add_argument("--budget", action="append",
                       help="kind:limit:window, repeatable")
    p_add.add_argument("--priority", type=int, default=0)
    p_add.add_argument("--valid-from", dest="valid_from")
    p_add.add_argument("--valid-until", dest="valid_until")
    p_add.add_argument("--notes", default="")
    p_add.set_defaults(func=cmd_add)

    p_rot = sub.add_parser("rotate", help="replace a credential's secret")
    add_target(p_rot)
    p_rot.add_argument("--secret")
    p_rot.add_argument("--secret-stdin", action="store_true")
    p_rot.set_defaults(func=cmd_rotate)

    for name, fn, helptext in (
        ("enable", cmd_enable, "enable a credential"),
        ("disable", cmd_disable, "disable without deleting"),
        ("remove", cmd_remove, "delete a credential"),
    ):
        p = sub.add_parser(name, help=helptext)
        add_target(p)
        p.set_defaults(func=fn)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
