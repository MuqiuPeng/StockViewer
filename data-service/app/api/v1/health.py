"""
Health check API endpoints.
"""
from fastapi import APIRouter
import time

from ...config import get_settings
from ...providers.registry import get_provider, list_providers
from ...models.responses import ApiResponse, HealthData, DependencyStatus, Meta

router = APIRouter()

_start_time = time.time()


@router.get("/health", response_model=ApiResponse[HealthData])
async def health_check():
    """
    Check the health status of the service.

    Returns service status, version, uptime, and the active provider's
    dependency status.
    """
    settings = get_settings()
    uptime = time.time() - _start_time

    provider = get_provider()
    health = provider.health_check()

    provider_status = health.get("status", "unhealthy")
    overall = "healthy" if provider_status == "healthy" else "degraded"

    return ApiResponse(
        success=True,
        data=HealthData(
            status=overall,
            version=settings.app_version,
            uptime_seconds=uptime,
            dependencies={
                settings.data_provider: DependencyStatus(
                    status=provider_status,
                    version=health.get("version"),
                    message=health.get("message"),
                ),
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


@router.get("/health/providers")
async def providers_list():
    """List all registered data providers and the currently active one."""
    settings = get_settings()
    return {
        "active": settings.data_provider,
        "registered": list_providers(),
    }
