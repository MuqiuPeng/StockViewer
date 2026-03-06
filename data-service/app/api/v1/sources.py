"""
Data sources API endpoints.
"""
from fastapi import APIRouter

from ...services.akshare_service import akshare_service
from ...models.responses import ApiResponse, DataSourcesData, Meta

router = APIRouter()


@router.get("/sources", response_model=ApiResponse[DataSourcesData])
async def get_data_sources():
    """
    Get list of available data sources.

    Returns all supported data sources with their configurations,
    including required parameters, symbol format, and examples.
    """
    result = akshare_service.get_data_sources()

    return ApiResponse(
        success=True,
        data=DataSourcesData(sources=result["data"]["sources"]),
        meta=Meta(),
    )
