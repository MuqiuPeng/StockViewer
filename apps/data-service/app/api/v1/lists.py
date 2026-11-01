"""
List API endpoints for stocks, indices, funds, and futures.
"""
from starlette.concurrency import run_in_threadpool
from fastapi import APIRouter, Query
from typing import Optional
import time

from ...providers.registry import get_provider
from ...models.responses import ApiResponse, ListData, ErrorDetail, Meta

router = APIRouter()


@router.get("/stocks", response_model=ApiResponse[ListData])
async def get_stock_list(
    market: str = Query(
        "a_share", description="Market: a_share, hk, us"
    ),
    include_delisted: bool = Query(
        False, description="Include delisted stocks"
    ),
):
    """
    Get list of stocks for a market.

    ## Markets
    - `a_share`: Chinese A-share stocks
    - `hk`: Hong Kong stocks
    - `us`: US stocks
    """
    start_time = time.time()

    result = await run_in_threadpool(
        get_provider().get_stock_list,
        market=market,
        include_delisted=include_delisted,
    )

    duration_ms = int((time.time() - start_time) * 1000)

    if not result["success"]:
        return ApiResponse(
            success=False,
            error=ErrorDetail(
                code=result.get("error_code", "UNKNOWN_ERROR"),
                message=result.get("error", "Unknown error"),
            ),
            meta=Meta(duration_ms=duration_ms),
        )

    data = result["data"]
    return ApiResponse(
        success=True,
        data=ListData(
            market=data.get("market"),
            count=data["count"],
            items=data["items"],
        ),
        meta=Meta(duration_ms=duration_ms),
    )


@router.get("/indices", response_model=ApiResponse[ListData])
async def get_index_list(
    market: str = Query(
        "zh", description="Market: zh, hk, us, global"
    ),
):
    """
    Get list of indices for a market.

    ## Markets
    - `zh`: Chinese indices
    - `hk`: Hong Kong indices
    - `us`: US indices
    - `global`: Global indices
    """
    start_time = time.time()

    result = await run_in_threadpool(get_provider().get_index_list, market=market)

    duration_ms = int((time.time() - start_time) * 1000)

    if not result["success"]:
        return ApiResponse(
            success=False,
            error=ErrorDetail(
                code=result.get("error_code", "UNKNOWN_ERROR"),
                message=result.get("error", "Unknown error"),
            ),
            meta=Meta(duration_ms=duration_ms),
        )

    data = result["data"]
    return ApiResponse(
        success=True,
        data=ListData(
            market=data.get("market"),
            count=data["count"],
            items=data["items"],
        ),
        meta=Meta(duration_ms=duration_ms),
    )


@router.get("/funds", response_model=ApiResponse[ListData])
async def get_fund_list(
    type: str = Query(
        "etf", description="Fund type: etf, lof"
    ),
):
    """
    Get list of funds.

    ## Types
    - `etf`: Exchange-traded funds
    - `lof`: Listed open-ended funds
    """
    start_time = time.time()

    result = await run_in_threadpool(get_provider().get_fund_list, fund_type=type)

    duration_ms = int((time.time() - start_time) * 1000)

    if not result["success"]:
        return ApiResponse(
            success=False,
            error=ErrorDetail(
                code=result.get("error_code", "UNKNOWN_ERROR"),
                message=result.get("error", "Unknown error"),
            ),
            meta=Meta(duration_ms=duration_ms),
        )

    data = result["data"]
    return ApiResponse(
        success=True,
        data=ListData(
            type=data.get("type"),
            count=data["count"],
            items=data["items"],
        ),
        meta=Meta(duration_ms=duration_ms),
    )


@router.get("/futures", response_model=ApiResponse[ListData])
async def get_futures_list():
    """
    Get list of futures contracts.
    """
    start_time = time.time()

    result = await run_in_threadpool(get_provider().get_futures_list)

    duration_ms = int((time.time() - start_time) * 1000)

    if not result["success"]:
        return ApiResponse(
            success=False,
            error=ErrorDetail(
                code=result.get("error_code", "UNKNOWN_ERROR"),
                message=result.get("error", "Unknown error"),
            ),
            meta=Meta(duration_ms=duration_ms),
        )

    data = result["data"]
    return ApiResponse(
        success=True,
        data=ListData(
            count=data["count"],
            items=data["items"],
        ),
        meta=Meta(duration_ms=duration_ms),
    )
