"""
Retry classification and backoff.

The rule that matters most is not how long to wait but whether to wait at all.
A 400 will fail identically on the third attempt as on the first, and retrying
it spends budget proving something already known. A 429 is the opposite: the
provider has said when to come back, and guessing instead is how a throttle
becomes a block.

Backoff is exponential with full jitter — ``random(0, min(cap, base * 2^n))``
rather than a fixed sequence, because clients that back off in lockstep
re-collide on the retry and produce exactly the burst the wait was meant to
avoid.
"""
from __future__ import annotations

import logging
import random
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


class RetryDecision(str, Enum):
    RETRY = "retry"                # transient; back off and try again
    RETRY_AFTER = "retry_after"    # the provider said when
    FALLBACK = "fallback"          # this provider is out; try another
    FAIL = "fail"                  # the request itself is wrong


# Status codes that mean "come back later" rather than "you asked wrongly".
_TRANSIENT_STATUS = {408, 425, 500, 502, 503, 504}
# Authentication and licensing. Worth a longer circuit cooldown, never a retry
# loop: a rejected key is not going to start working within the minute.
_AUTH_STATUS = {401, 403}


def classify_status(status: int) -> RetryDecision:
    if status == 429:
        return RetryDecision.RETRY_AFTER
    if status in _TRANSIENT_STATUS:
        return RetryDecision.RETRY
    if status in _AUTH_STATUS:
        return RetryDecision.FALLBACK
    if 400 <= status < 500:
        # 404 and friends: the symbol or endpoint is wrong. Asking again, or
        # asking a different provider, will produce the same answer.
        return RetryDecision.FAIL
    return RetryDecision.RETRY if status >= 500 else RetryDecision.FAIL


def is_auth_failure(status: int) -> bool:
    return status in _AUTH_STATUS


def parse_retry_after(value: Optional[str], *, now: Optional[datetime] = None) -> Optional[float]:
    """
    Seconds to wait, from a Retry-After header.

    The header comes in two forms and both appear in the wild: a delay in
    seconds, and an HTTP date. A malformed value returns None so the caller
    falls back to its own backoff rather than treating garbage as zero and
    retrying immediately.
    """
    if not value:
        return None

    raw = value.strip()

    if re.fullmatch(r"\d+", raw):
        return float(raw)

    try:
        when = parsedate_to_datetime(raw)
    except (TypeError, ValueError):
        logger.debug("Unparseable Retry-After: %r", value)
        return None

    if when is None:
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)

    reference = now or datetime.now(timezone.utc)
    delay = (when - reference).total_seconds()
    return max(0.0, delay)


def backoff_delay(
    attempt: int, *, base: float = 0.5, cap: float = 30.0,
    rng: Optional[random.Random] = None,
) -> float:
    """
    Full-jitter exponential backoff for a 1-based attempt number.

    Returns a value in [0, min(cap, base * 2**(attempt-1))]. The randomness is
    the point: a fixed schedule makes concurrent clients retry together.
    """
    if attempt < 1:
        attempt = 1
    ceiling = min(cap, base * (2 ** (attempt - 1)))
    return (rng or random).uniform(0.0, ceiling)


def should_retry(
    decision: RetryDecision, attempt: int, max_attempts: int
) -> bool:
    """Whether to make another attempt, given the classification."""
    if decision in (RetryDecision.FAIL, RetryDecision.FALLBACK):
        return False
    return attempt < max_attempts
