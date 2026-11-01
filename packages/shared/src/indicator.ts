/**
 * A user-authored indicator: Python that produces one column, or a group
 * of columns, against a dataset.
 */
export interface Indicator {
  id: string;
  name: string;
  description: string;
  pythonCode: string;
  outputColumn: string;           // For single indicators (or group name for groups)
  createdAt: string;
  updatedAt?: string;
  dependencies: string[];         // Indicator IDs this depends on
  dependencyColumns?: string[];   // Specific columns used, e.g., ["KDJ:K", "SMA_20"]

  // Indicator groups (e.g., MACD with DIF, DEA, MACD)
  isGroup?: boolean;              // true for MyTT group indicators
  groupName?: string;             // e.g., "MACD" (same as outputColumn for groups)
  expectedOutputs?: string[];     // e.g., ["DIF", "DEA", "MACD"]

  // External datasets to include in parameters
  externalDatasets?: Record<string, { groupId: string; datasetName: string }>;

  category?: string;
  tags?: string[];
}
