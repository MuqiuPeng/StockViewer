"""
Main API router for v1 endpoints.
"""
from fastapi import APIRouter

from .history import router as history_router
from .lists import router as lists_router
from .health import router as health_router
from .sources import router as sources_router

router = APIRouter()

# Include sub-routers
router.include_router(health_router, tags=["Health"])
router.include_router(sources_router, tags=["Data Sources"])
router.include_router(history_router, prefix="/history", tags=["Historical Data"])
router.include_router(lists_router, prefix="/lists", tags=["Lists"])
