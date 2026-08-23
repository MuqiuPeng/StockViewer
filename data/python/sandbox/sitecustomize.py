"""
In-process confinement for user-authored Python.

The kernel sandboxes are the strong layer, but there is one only on macOS and
one only on Linux, and neither is guaranteed present. Leaving every other host
with no confinement at all would be worse than having none anywhere, because
the protection would appear to exist and quietly not.

So this is the portable floor: CPython's audit hooks, available on every
platform since 3.8. It is weaker than a kernel boundary — it lives inside the
process it constrains — but it is uniform, and it holds one property that
matters: CPython offers no API to remove an audit hook once installed. User
code cannot unregister it, only try to reach around it, which is what the
blocked events below are for.

Loaded through ``sitecustomize``, which ``site`` imports during interpreter
startup, so the hook is in place before any executor or strategy code runs.
The deny list arrives as JSON in the environment rather than being hard-coded
here, so the same list drives this and the kernel profile.
"""
from __future__ import annotations

import json
import os
import sys

_DENY_ENV = "SV_SANDBOX_DENY"
_NETWORK_ENV = "SV_SANDBOX_DENY_NETWORK"


class SandboxViolation(PermissionError):
    """A blocked operation. Subclasses PermissionError so callers see EPERM."""


def _install() -> None:
    raw = os.environ.get(_DENY_ENV)
    if not raw:
        return

    try:
        denied = [os.path.realpath(p) for p in json.loads(raw)]
    except (ValueError, TypeError):
        # A malformed list must fail closed. Continuing would run user code
        # believing it was confined when nothing is being checked.
        raise SandboxViolation(f"{_DENY_ENV} is not a valid JSON path list")

    deny_network = os.environ.get(_NETWORK_ENV) == "1"

    def blocked(path: str) -> bool:
        # realpath so that a symlink, a relative path or ../ cannot name a
        # denied file by another route.
        try:
            resolved = os.path.realpath(path)
        except (OSError, ValueError):
            return False
        return any(
            resolved == d or resolved.startswith(d + os.sep) for d in denied
        )

    def hook(event: str, args) -> None:
        # `open` covers builtins.open, os.open and pathlib alike — they all
        # raise it — so one check catches the ordinary routes to a file.
        if event == "open":
            path = args[0]
            if isinstance(path, (str, bytes, os.PathLike)):
                p = os.fsdecode(path) if not isinstance(path, str) else path
                if blocked(p):
                    raise SandboxViolation(f"reading {p} is not permitted here")

        # Enumerating a directory raises its own event rather than `open`, so
        # without this a denied directory's contents could still be listed —
        # which for .pgdata names every table on disk.
        elif event in ("os.listdir", "os.scandir"):
            path = args[0]
            if isinstance(path, (str, bytes, os.PathLike)):
                p = path if isinstance(path, str) else os.fsdecode(path)
                if blocked(p):
                    raise SandboxViolation(f"listing {p} is not permitted here")

        # A subprocess inherits none of these hooks and could read anything on
        # this process's behalf, so the cheap routes to one are closed.
        #
        # ctypes is deliberately NOT blocked, and that is the honest limit of
        # this layer: it could call libc's open directly and never raise the
        # event above. Blocking it is not an option — numpy calls dlopen while
        # importing, so the ban breaks the interpreter before user code runs —
        # and gating it after imports only moves the bypass, since the flag
        # would live in a closure cell that reachable code can rewrite.
        #
        # This is why the kernel layer is the boundary and this one is not
        # described as a substitute for it.
        elif event in ("subprocess.Popen", "os.system", "os.exec", "os.posix_spawn"):
            raise SandboxViolation("starting processes is not permitted in user code")

        elif deny_network and event in ("socket.connect", "socket.getaddrinfo"):
            raise SandboxViolation("network access is not permitted in user code")

    sys.addaudithook(hook)


_install()
