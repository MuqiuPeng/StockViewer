export type Period = 'daily' | 'weekly' | 'monthly' | 'quarterly';

export interface ImportableIndicator {
  id: string;
  name: string;
  ownerEmail: string;
  description: string;
  isOwner: boolean;
  outputColumn: string;
  isGroup?: boolean;
  groupName?: string;
  expectedOutputs?: string[];
}

export interface ImportableItem {
  id: string;
  indicatorName: string;
  columnName: string;
  displayName: string;
  ownerEmail: string;
  isOwner: boolean;
  isGroupColumn: boolean;
}

export interface ImportableDatasetColumn {
  datasetSymbol: string;
  datasetName: string;
  column: string;
  displayName: string;
}

export interface DataSourcesConfig {
  baseColumns: string[];
  indicators: ImportableItem[];
  datasetColumns: ImportableDatasetColumn[];
}
