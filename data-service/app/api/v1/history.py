"""
Historical data API endpoints.
"""
from starlette.concurrency import run_in_threadpool
from fastapi import APIRouter, Query, HTTPException
from typing import Optional
import time

from ...routing import get_router
from ...models.responses import ApiResponse, HistoryData, ErrorDetail, Meta
from ...services.log_forwarder import forward_log

router = APIRouter()


@router.get("/{data_source}", response_model=ApiResponse[HistoryData])
async def get_history(
    data_source: str,
    symbol: str = Query(..., description="Stock/index symbol"),
    start_date: Optional[str] = Query(
        None, description="Start date in YYYYMMDD format"
    ),
    end_date: Optional[str] = Query(None, description="End date in YYYYMMDD format"),
    adjust: Optional[str] = Query(
        "qfq", description="Price adjustment: qfq (forward), hfq (backward), or none"
    ),
    period: Optional[str] = Query(
        "daily", description="Data period: daily, weekly, monthly"
    ),
):
    """
    Fetch historical OHLCV data for a symbol.

    ## Supported Data Sources
    - `stock_zh_a_hist`: A-share stocks (China)
    - `stock_hk_hist`: Hong Kong stocks
    - `stock_us_hist`: US stocks
    - `fund_etf_hist_em`: ETF funds
    - `index_zh_a_hist`: Chinese indices

    ## Parameters
    - **symbol**: Stock/index code (e.g., "000001" for A-shares)
    - **start_date**: Start date in YYYYMMDD format (optional)
    - **end_date**: End date in YYYYMMDD format (optional)
    - **adjust**: Price adjustment type (default: "qfq")
    - **period**: Data period (default: "daily")
    """
    start_time = time.time()

    routed = await run_in_threadpool(
        get_router().execute,
        lambda provider: provider.get_history(
            data_source=data_source,
            symbol=symbol,
            start_date=start_date,
            end_date=end_date,
            adjust=adjust,
            period=period,
        ),
        data_source=data_source,
    )
    result = routed.result

    duration_ms = int((time.time() - start_time) * 1000)

    if not result["success"]:
        error_code = result.get("error_code", "UNKNOWN_ERROR")
        status_code = 404 if error_code == "NO_DATA" else 400
        if error_code == "FETCH_ERROR":
            status_code = 500

        forward_log("ERROR", "fetch_history", f"Failed to fetch {data_source}/{symbol}: {result.get('error', 'Unknown')}", {"data_source": data_source, "symbol": symbol, "error_code": error_code, "duration_ms": duration_ms})

        return ApiResponse(
            success=False,
            error=ErrorDetail(
                code=error_code,
                message=result.get("error", "Unknown error"),
            ),
            meta=Meta(duration_ms=duration_ms, **routed.provenance()),
        )

    data = result["data"]
    forward_log("INFO", "fetch_history", f"Fetched {data['row_count']} records for {data_source}/{symbol}", {"data_source": data_source, "symbol": symbol, "row_count": data["row_count"], "duration_ms": duration_ms})

    return ApiResponse(
        success=True,
        data=HistoryData(
            symbol=data["symbol"],
            name=data.get("name"),
            data_source=data["data_source"],
            first_date=data.get("first_date"),
            last_date=data.get("last_date"),
            row_count=data["row_count"],
            records=data["records"],
            # Provider-supplied caveats about what it could not honour.
            range_truncated=data.get("range_truncated"),
            adjust_ignored=data.get("adjust_ignored"),
        ),
        meta=Meta(duration_ms=duration_ms, **routed.provenance()),
    )
