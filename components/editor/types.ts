export type Period = 'daily' | 'weekly' | 'monthly' | 'quarterly';

export interface PlaceholderInfo {
  type: 'base' | 'indicator' | 'dataset';
  id: string;
  displayName: string;
  startOffset: number;
  endOffset: number;
  lineNumber: number;
  column: number;
  length: number;
}

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

export interface PickerItem {
  type: 'base' | 'indicator' | 'dataset';
  label: string;
  detail?: string;
  // For base columns
  column?: string;
  // For indicators
  indicatorName?: string;
  columnName?: string;
  isGroupColumn?: boolean;
  ownerEmail?: string;
  // For datasets
  datasetSymbol?: string;
  datasetColumn?: string;
  datasetName?: string;
}

export interface PickerState {
  isOpen: boolean;
  mode: 'insert' | 'replace';
  position: { lineNumber: number; column: number } | null;
  anchorPlaceholder: PlaceholderInfo | null;
}

export interface DataSourcesConfig {
  baseColumns: string[];
  indicators: ImportableItem[];
  datasetColumns: ImportableDatasetColumn[];
}

export interface VisualBlocksAPI {
  onEditorMount: (editor: any, monaco: any) => void;
  pickerState: PickerState;
  closePicker: () => void;
  selectedPlaceholder: PlaceholderInfo | null;
  insertPlaceholder: (item: PickerItem) => void;
  pickerContainerRef: React.RefObject<HTMLDivElement | null>;
  dataSources: DataSourcesConfig;
}
