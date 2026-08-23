"""
Health check API endpoints.
"""
from starlette.concurrency import run_in_threadpool
from fastapi import APIRouter
import time

from ...config import get_settings
from ...gateway_config import load_config
from ...providers.registry import get_provider, list_providers
from ...resilience import all_breakers
from ...models.responses import ApiResponse, HealthData, DependencyStatus, Meta

router = APIRouter()

_start_time = time.time()


def _collect_provider_health() -> dict:
    """Health of every registered provider, one entry each."""
    out = {}
    for name in list_providers():
        try:
            out[name] = get_provider(name).health_check()
        except Exception as exc:
            out[name] = {"status": "unhealthy", "version": None, "message": str(exc)}
    return out


@router.get("/health", response_model=ApiResponse[HealthData])
async def health_check():
    """
    Check the health status of the service.

    Reports every registered provider rather than a single active one. Since
    routing picks per data source, one provider being down does not mean the
    service is: EastMoney can be refusing connections while Tiingo still
    answers every A-share and US request. Overall status is degraded only when
    something is actually unavailable, and unhealthy when nothing is left.
    """
    settings = get_settings()
    uptime = time.time() - _start_time

    # health_check() reaches the network for some providers, so keep it off
    # the event loop.
    reports = await run_in_threadpool(_collect_provider_health)

    healthy = [n for n, r in reports.items() if r.get("status") == "healthy"]
    if not reports:
        overall = "unhealthy"
    elif len(healthy) == len(reports):
        overall = "healthy"
    elif healthy:
        overall = "degraded"
    else:
        overall = "unhealthy"

    return ApiResponse(
        success=True,
        data=HealthData(
            status=overall,
            version=settings.app_version,
            uptime_seconds=uptime,
            dependencies={
                name: DependencyStatus(
                    status=r.get("status", "unhealthy"),
                    version=r.get("version"),
                    message=r.get("message"),
                )
                for name, r in reports.items()
            },
        ),
        meta=Meta(),
    )


@router.get("/health/ready")
async def readiness_check():
    """Kubernetes readiness probe."""
    return {"status": "ready"}


@router.get("/health/live")
async def liveness_check():
    """Kubernetes liveness probe."""
    return {"status": "alive"}


@router.get("/health/circuits")
async def circuit_states():
    """
    Current breaker state per provider and capability.

    Worth its own endpoint: an open circuit explains why a provider is being
    skipped without anything appearing to fail, which is otherwise a confusing
    thing to debug from the outside.
    """
    return {"circuits": all_breakers()}


@router.get("/health/providers")
async def providers_list():
    """List all registered data providers and the currently active one."""
    settings = get_settings()
    return {
        "active": settings.data_provider,
        "registered": list_providers(),
    }
