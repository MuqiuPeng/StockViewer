"""
Response models for the Stock Data Service API.
"""
from typing import Optional, List, Dict, Any, Generic, TypeVar
from pydantic import BaseModel, Field
from datetime import datetime
import uuid

T = TypeVar("T")


class Meta(BaseModel):
    """Metadata for API responses."""
    request_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    duration_ms: Optional[int] = None


class ErrorDetail(BaseModel):
    """Error details for API responses."""
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None


class ApiResponse(BaseModel, Generic[T]):
    """Generic API response wrapper."""
    success: bool
    data: Optional[T] = None
    error: Optional[ErrorDetail] = None
    meta: Meta = Field(default_factory=Meta)


# History Data Models
class StockRecord(BaseModel):
    """Single stock price record."""
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int
    turnover: Optional[float] = None
    amplitude: Optional[float] = None
    change_pct: Optional[float] = None
    change_amount: Optional[float] = None
    turnover_rate: Optional[float] = None


class HistoryData(BaseModel):
    """Historical stock data response."""
    symbol: str
    name: Optional[str] = None
    data_source: str
    first_date: Optional[str] = None
    last_date: Optional[str] = None
    row_count: int
    records: List[StockRecord]


# List Data Models
class StockItem(BaseModel):
    """Single stock item in list."""
    code: str
    name: str
    exchange: Optional[str] = None
    status: Optional[str] = "active"


class IndexItem(BaseModel):
    """Single index item in list."""
    code: str
    name: str
    market: Optional[str] = None


class FundItem(BaseModel):
    """Single fund item in list."""
    code: str
    name: str
    type: Optional[str] = None


class FuturesItem(BaseModel):
    """Single futures item in list."""
    code: str
    name: str
    exchange: Optional[str] = None


class ListData(BaseModel):
    """Generic list data response."""
    market: Optional[str] = None
    type: Optional[str] = None
    count: int
    items: List[Any]


# Data Source Models
class DataSourceParam(BaseModel):
    """Parameter definition for a data source."""
    name: str
    type: str
    required: bool
    description: Optional[str] = None
    default: Optional[Any] = None


class DataSourceInfo(BaseModel):
    """Information about a data source."""
    id: str
    name: str
    category: str
    description: Optional[str] = None
    parameters: List[DataSourceParam]
    symbol_format: Optional[str] = None
    example_symbol: Optional[str] = None


class DataSourcesData(BaseModel):
    """List of available data sources."""
    sources: List[DataSourceInfo]


# Health Check Models
class DependencyStatus(BaseModel):
    """Status of a dependency."""
    status: str
    version: Optional[str] = None
    message: Optional[str] = None


class HealthData(BaseModel):
    """Health check response."""
    status: str
    version: str
    uptime_seconds: float
    dependencies: Dict[str, DependencyStatus]
