"""
Health check API endpoints.
"""
from fastapi import APIRouter
import time
import akshare as ak

from ...config import get_settings
from ...models.responses import ApiResponse, HealthData, DependencyStatus, Meta

router = APIRouter()

# Track service start time
_start_time = time.time()


@router.get("/health", response_model=ApiResponse[HealthData])
async def health_check():
    """
    Check the health status of the service.

    Returns service status, version, uptime, and dependency status.
    """
    settings = get_settings()
    uptime = time.time() - _start_time

    # Check AKShare status
    akshare_status = "healthy"
    akshare_message = None
    try:
        # Quick test to verify AKShare is working
        _ = ak.__version__
    except Exception as e:
        akshare_status = "unhealthy"
        akshare_message = str(e)

    return ApiResponse(
        success=True,
        data=HealthData(
            status="healthy" if akshare_status == "healthy" else "degraded",
            version=settings.app_version,
            uptime_seconds=uptime,
            dependencies={
                "akshare": DependencyStatus(
                    status=akshare_status,
                    version=ak.__version__,
                    message=akshare_message,
                ),
            },
        ),
        meta=Meta(),
    )


@router.get("/health/ready")
async def readiness_check():
    """
    Kubernetes readiness probe.

    Returns 200 if the service is ready to accept traffic.
    """
    return {"status": "ready"}


@router.get("/health/live")
async def liveness_check():
    """
    Kubernetes liveness probe.

    Returns 200 if the service is alive.
    """
    return {"status": "alive"}
