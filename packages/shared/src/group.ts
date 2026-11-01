/**
 * A named set of stocks, applied to indicators and backtests together.
 */
export interface StockGroup {
  id: string;
  name: string;
  description?: string;
  stockIds: string[];         // Array of Stock IDs (references Stock table)
  createdAt: string;
  updatedAt?: string;
  isDataSource?: boolean;     // True for auto-generated data source groups
  dataSourceName?: string;    // The data source identifier when isDataSource is true
}
