/**
 * Stock Data Service Client
 *
 * TypeScript client for communicating with the Stock Data Service.
 * Provides typed interfaces for all API endpoints.
 */

// Configuration
const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000';
const DATA_SERVICE_TIMEOUT = parseInt(process.env.DATA_SERVICE_TIMEOUT_MS || '60000', 10);
const DATA_SERVICE_RETRIES = parseInt(process.env.DATA_SERVICE_RETRIES || '2', 10);

// Types
export interface StockRecord {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover?: number;
  amplitude?: number;
  change_pct?: number;
  change_amount?: number;
  turnover_rate?: number;
}

export interface HistoryData {
  symbol: string;
  name?: string;
  data_source: string;
  first_date?: string;
  last_date?: string;
  row_count: number;
  records: StockRecord[];
}

export interface StockItem {
  code: string;
  name: string;
  exchange?: string;
  status?: string;
}

export interface IndexItem {
  code: string;
  name: string;
  market?: string;
}

export interface FundItem {
  code: string;
  name: string;
  type?: string;
}

export interface FuturesItem {
  code: string;
  name: string;
  exchange?: string;
}

export interface ListData<T> {
  market?: string;
  type?: string;
  count: number;
  items: T[];
}

export interface DataSourceInfo {
  id: string;
  name: string;
  category: string;
  symbol_format?: string;
  example_symbol?: string;
  parameters: string[];
}

export interface HealthData {
  status: string;
  version: string;
  uptime_seconds: number;
  dependencies: Record<string, {
    status: string;
    version?: string;
    message?: string;
  }>;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: {
    request_id: string;
    timestamp: string;
    duration_ms?: number;
  };
}

export interface HistoryRequest {
  dataSource: string;
  symbol: string;
  startDate?: string;
  endDate?: string;
  adjust?: 'qfq' | 'hfq' | 'none';
  period?: 'daily' | 'weekly' | 'monthly';
}

/**
 * Data Service Client
 *
 * Provides methods for interacting with the Stock Data Service API.
 */
export class DataServiceClient {
  private baseUrl: string;
  private timeout: number;
  private retries: number;

  constructor(config?: {
    baseUrl?: string;
    timeout?: number;
    retries?: number;
  }) {
    this.baseUrl = config?.baseUrl || DATA_SERVICE_URL;
    this.timeout = config?.timeout || DATA_SERVICE_TIMEOUT;
    this.retries = config?.retries || DATA_SERVICE_RETRIES;
  }

  /**
   * Fetch with timeout and retry support.
   */
  private async fetchWithRetry<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          return {
            success: false,
            error: {
              code: errorData.error?.code || 'HTTP_ERROR',
              message: errorData.error?.message || `HTTP ${response.status}`,
            },
            meta: errorData.meta || {
              request_id: '',
              timestamp: new Date().toISOString(),
            },
          };
        }

        return await response.json();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.retries) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        }
      }
    }

    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: lastError?.message || 'Network request failed',
      },
      meta: {
        request_id: '',
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Get historical OHLCV data for a symbol.
   */
  async getHistory(request: HistoryRequest): Promise<ApiResponse<HistoryData>> {
    const params = new URLSearchParams({
      symbol: request.symbol,
    });

    if (request.startDate) params.set('start_date', request.startDate);
    if (request.endDate) params.set('end_date', request.endDate);
    if (request.adjust) params.set('adjust', request.adjust);
    if (request.period) params.set('period', request.period);

    const url = `${this.baseUrl}/api/v1/history/${request.dataSource}?${params}`;
    return this.fetchWithRetry<HistoryData>(url);
  }

  /**
   * Get list of stocks for a market.
   */
  async getStockList(
    market: 'a_share' | 'hk' | 'us' = 'a_share',
    includeDelisted: boolean = false
  ): Promise<ApiResponse<ListData<StockItem>>> {
    const params = new URLSearchParams({
      market,
      include_delisted: String(includeDelisted),
    });

    const url = `${this.baseUrl}/api/v1/lists/stocks?${params}`;
    return this.fetchWithRetry<ListData<StockItem>>(url);
  }

  /**
   * Get list of indices for a market.
   */
  async getIndexList(
    market: 'zh' | 'hk' | 'us' | 'global' = 'zh'
  ): Promise<ApiResponse<ListData<IndexItem>>> {
    const params = new URLSearchParams({ market });
    const url = `${this.baseUrl}/api/v1/lists/indices?${params}`;
    return this.fetchWithRetry<ListData<IndexItem>>(url);
  }

  /**
   * Get list of funds.
   */
  async getFundList(
    type: 'etf' | 'lof' = 'etf'
  ): Promise<ApiResponse<ListData<FundItem>>> {
    const params = new URLSearchParams({ type });
    const url = `${this.baseUrl}/api/v1/lists/funds?${params}`;
    return this.fetchWithRetry<ListData<FundItem>>(url);
  }

  /**
   * Get list of futures contracts.
   */
  async getFuturesList(): Promise<ApiResponse<ListData<FuturesItem>>> {
    const url = `${this.baseUrl}/api/v1/lists/futures`;
    return this.fetchWithRetry<ListData<FuturesItem>>(url);
  }

  /**
   * Get available data sources.
   */
  async getDataSources(): Promise<ApiResponse<{ sources: DataSourceInfo[] }>> {
    const url = `${this.baseUrl}/api/v1/sources`;
    return this.fetchWithRetry<{ sources: DataSourceInfo[] }>(url);
  }

  /**
   * Check service health.
   */
  async getHealth(): Promise<ApiResponse<HealthData>> {
    const url = `${this.baseUrl}/api/v1/health`;
    return this.fetchWithRetry<HealthData>(url);
  }

  /**
   * Check if service is healthy.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.getHealth();
      return response.success && response.data?.status === 'healthy';
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const dataService = new DataServiceClient();

/**
 * Helper function to fetch stock data (compatible with existing code).
 *
 * This function provides backward compatibility with the existing
 * fetchStockData function used in API routes.
 */
export async function fetchStockDataFromService(
  symbol: string,
  dataSource: string,
  startDate?: string,
  endDate?: string
): Promise<{
  success: boolean;
  data?: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    turnover?: number;
    amplitude?: number;
    change_pct?: number;
    change_amount?: number;
    turnover_rate?: number;
  }>;
  firstDate?: string;
  lastDate?: string;
  stockName?: string;
  error?: string;
}> {
  const response = await dataService.getHistory({
    dataSource,
    symbol,
    startDate,
    endDate,
    adjust: 'qfq',
  });

  if (!response.success || !response.data) {
    return {
      success: false,
      error: response.error?.message || 'Failed to fetch data',
    };
  }

  return {
    success: true,
    data: response.data.records,
    firstDate: response.data.first_date,
    lastDate: response.data.last_date,
    stockName: response.data.name,
  };
}
