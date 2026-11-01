"""
Log forwarder for sending structured logs to the Next.js app's SystemLog table.

Buffers log entries in memory and flushes them in batches to
POST /api/admin/logs/ingest/service, authenticated via X-Log-Secret header.

Usage:
    from app.services.log_forwarder import forward_log, start_log_flusher

    # Call once at startup (e.g. in main.py lifespan):
    await start_log_flusher()

    # Then anywhere:
    forward_log("INFO", "fetch_history", "Fetched 1000 records for 000001")
"""

import asyncio
import logging
import os
from collections import deque
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)

_LOG_INGEST_URL = os.getenv("LOG_INGEST_URL", "http://localhost:3000/api/admin/logs/ingest/service")
_LOG_INGEST_SECRET = os.getenv("LOG_INGEST_SECRET", "")
_BUFFER: deque = deque(maxlen=500)
_FLUSH_INTERVAL = 5  # seconds
_FLUSH_BATCH_SIZE = 10
_flusher_task: Optional[asyncio.Task] = None


def forward_log(
    level: str,
    action: str,
    message: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    """Queue a log entry for async forwarding."""
    _BUFFER.append({
        "level": level,
        "action": action,
        "message": message,
        "metadata": metadata,
    })


async def _flush() -> None:
    """Send buffered entries to the ingest endpoint."""
    if not _BUFFER or not _LOG_INGEST_SECRET:
        return

    entries = []
    while _BUFFER and len(entries) < 100:
        entries.append(_BUFFER.popleft())

    if not entries:
        return

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                _LOG_INGEST_URL,
                json={"entries": entries},
                headers={"X-Log-Secret": _LOG_INGEST_SECRET},
            )
            if r.status_code != 200:
                logger.warning("Log ingest returned %d: %s", r.status_code, r.text[:200])
    except Exception as exc:
        logger.debug("Log forwarding failed: %s", exc)
        # Put entries back (best effort, may exceed maxlen and drop oldest)
        for e in reversed(entries):
            _BUFFER.appendleft(e)


async def _flusher_loop() -> None:
    """Background loop that periodically flushes the buffer."""
    while True:
        await asyncio.sleep(_FLUSH_INTERVAL)
        if len(_BUFFER) >= _FLUSH_BATCH_SIZE or _BUFFER:
            await _flush()


async def start_log_flusher() -> None:
    """Start the background flusher task. Safe to call multiple times."""
    global _flusher_task
    if _flusher_task is None or _flusher_task.done():
        _flusher_task = asyncio.create_task(_flusher_loop())
        logger.info("Log flusher started")


async def stop_log_flusher() -> None:
    """Flush remaining entries and stop the background task."""
    global _flusher_task
    await _flush()
    if _flusher_task and not _flusher_task.done():
        _flusher_task.cancel()
        try:
            await _flusher_task
        except asyncio.CancelledError:
            pass
    _flusher_task = None
