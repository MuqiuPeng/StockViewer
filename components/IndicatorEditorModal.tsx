'use client';

import { useState, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useTheme } from './ThemeProvider';

type Period = 'daily' | 'weekly' | 'monthly' | 'quarterly';

interface Indicator {
  id: string;
  name: string;
  description: string;
  pythonCode: string;
  outputColumn: string;
  isGroup?: boolean;
  groupName?: string;
  expectedOutputs?: string[];
  externalDatasets?: Record<string, { groupId: string; datasetName: string }>;
  period?: Period;
}

interface IndicatorEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (savedItem?: Indicator, type?: 'indicator') => void;
  indicator?: Indicator | null;
  readOnly?: boolean;
}

// Import panel interfaces
interface ImportableIndicator {
  id: string;
  name: string;
  ownerEmail: string;
  description: string;
  isOwner: boolean;
  outputColumn: string;
}

interface ImportableDataset {
  id: string;
  symbol: string;
  name: string;
  dataSource: string;
}

interface PlaceholderInfo {
  type: 'indicator' | 'dataset';
  id: string;  // Indicator or dataset ID
  displayName: string;  // Display name shown in tag
  // Position in editor
  startOffset: number;
  endOffset: number;
  lineNumber: number;
  column: number;
  length: number;
}

// Placeholder format: ◈IND:name◈ and ◇DS:name◇
// The ID is stored in a mapping, not in the placeholder itself
// This allows the visual placeholder to be short and look like a tag

// Transform visual placeholders to actual Python import code (before save/validate)
const transformPlaceholdersToCode = (code: string, idMap: Map<string, string>): string => {
  let result = code;
  // Transform indicator placeholders: ◈IND:name◈ -> data.import_(indicator_id='id')
  result = result.replace(/◈IND:([^◈]+)◈/g, (match, name) => {
    const id = idMap.get(`ind:${name}`);
    if (id) {
      return `data.import_(indicator_id='${id}')`;
    }
    return match; // Keep original if no mapping found
  });
  // Transform dataset placeholders: ◇DS:name◇ -> data.import_(dataset_id='id')
  result = result.replace(/◇DS:([^◇]+)◇/g, (match, name) => {
    const id = idMap.get(`ds:${name}`);
    if (id) {
      return `data.import_(dataset_id='${id}')`;
    }
    return match;
  });
  return result;
};

// Transform Python import code to visual placeholders (when loading for editing)
// Returns both the transformed code and a mapping of name->id
const transformCodeToPlaceholders = (
  code: string,
  indicators: { id: string; name: string }[],
  datasets: { id: string; symbol: string }[]
): { code: string; idMap: Map<string, string> } => {
  const idMap = new Map<string, string>();
  let result = code;

  // Transform indicator imports
  result = result.replace(
    /data\.import_\(\s*indicator_id\s*=\s*['"]([^'"]+)['"]\s*\)/g,
    (match, id) => {
      const ind = indicators.find(i => i.id === id);
      if (ind) {
        idMap.set(`ind:${ind.name}`, id);
        return `◈IND:${ind.name}◈`;
      }
      // Fallback: use ID as display name
      idMap.set(`ind:${id}`, id);
      return `◈IND:${id}◈`;
    }
  );

  // Transform dataset imports
  result = result.replace(
    /data\.import_\(\s*dataset_id\s*=\s*['"]([^'"]+)['"]\s*\)/g,
    (match, id) => {
      const ds = datasets.find(d => d.id === id);
      if (ds) {
        idMap.set(`ds:${ds.symbol}`, id);
        return `◇DS:${ds.symbol}◇`;
      }
      // Fallback: use ID as display name
      idMap.set(`ds:${id}`, id);
      return `◇DS:${id}◇`;
    }
  );

  return { code: result, idMap };
};

// Find all visual placeholders in code
const findPlaceholders = (code: string): PlaceholderInfo[] => {
  const placeholders: PlaceholderInfo[] = [];
  const lines = code.split('\n');
  let offset = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    // Find indicator placeholders ◈IND:name◈
    const indRegex = /◈IND:([^◈]+)◈/g;
    let match;
    while ((match = indRegex.exec(line)) !== null) {
      placeholders.push({
        type: 'indicator',
        id: '', // ID is in the mapping, not needed here for display
        displayName: match[1],
        startOffset: offset + match.index,
        endOffset: offset + match.index + match[0].length,
        lineNumber: lineIdx + 1,
        column: match.index + 1,
        length: match[0].length,
      });
    }

    // Find dataset placeholders ◇DS:name◇
    const dsRegex = /◇DS:([^◇]+)◇/g;
    while ((match = dsRegex.exec(line)) !== null) {
      placeholders.push({
        type: 'dataset',
        id: '',
        displayName: match[1],
        startOffset: offset + match.index,
        endOffset: offset + match.index + match[0].length,
        lineNumber: lineIdx + 1,
        column: match.index + 1,
        length: match[0].length,
      });
    }

    offset += line.length + 1; // +1 for newline
  }

  return placeholders;
};

const CODE_TEMPLATE = `def calculate(data):
    """
    Calculate indicator from stock data.

    Args:
        data: pandas DataFrame with columns:
            - date (datetime)
            - open, high, low, close, volume (float)
            - All other existing indicators
            - If external datasets are configured, their columns will be included
              with format: {dataset_name}@{column_name}

    Returns:
        pandas Series or list of same length as data
    """
    # Example: 20-day Simple Moving Average
    return data['close'].rolling(20).mean()`;

const MYTT_TEMPLATE = `def calculate(data):
    """
    Calculate indicator group using MyTT functions.

    Args:
        data: pandas DataFrame with columns:
            - date (datetime)
            - open, high, low, close, volume (float)
            - All existing indicators
            - If external datasets are configured, their columns will be included
              with format: {dataset_name}@{column_name}

    Returns:
        dict with indicator_name: values (numpy array or pandas Series)
    """
    # Example: MACD indicator group
    DIF, DEA, MACD_hist = MACD(data['close'].values, SHORT=12, LONG=26, M=9)

    return {
        'DIF': DIF,
        'DEA': DEA,
        'MACD': MACD_hist
    }`;

export default function IndicatorEditorModal({
  isOpen,
  onClose,
  onSuccess,
  indicator,
  readOnly = false,
}: IndicatorEditorModalProps) {
  const { theme } = useTheme();
  const [indicatorType, setIndicatorType] = useState<'custom' | 'mytt_group'>('custom');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [outputColumn, setOutputColumn] = useState('');
  const [groupName, setGroupName] = useState('');
  const [expectedOutputs, setExpectedOutputs] = useState<string[]>(['']);
  const [pythonCode, setPythonCode] = useState('');
  const [externalDatasets, setExternalDatasets] = useState<Record<string, { groupId: string; datasetName: string }>>({});
  const [period, setPeriod] = useState<Period>('daily');
  const [editingDataset, setEditingDataset] = useState<string | null>(null);
  const [tempDatasetConfig, setTempDatasetConfig] = useState<{ paramName: string; groupId: string; datasetName: string } | null>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'text' | 'upload'>('text');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<any>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [syntaxWarnings, setSyntaxWarnings] = useState<string[]>([]);
  const [showSyntaxHelp, setShowSyntaxHelp] = useState(false);
  const [editorInstance, setEditorInstance] = useState<any>(null);
  const [monacoInstance, setMonacoInstance] = useState<any>(null);

  // Orphaned columns check state
  const [showOrphanedColumnsModal, setShowOrphanedColumnsModal] = useState(false);
  const [orphanedColumnsData, setOrphanedColumnsData] = useState<{
    orphanedColumns: string[];
    dependentIndicators: { column: string; indicators: { id: string; name: string }[] }[];
  } | null>(null);
  const [isCleaningOrphans, setIsCleaningOrphans] = useState(false);

  // Column rename auto-fix state
  const [showColumnRenameModal, setShowColumnRenameModal] = useState(false);
  const [columnRenameData, setColumnRenameData] = useState<{
    columnRenames: { column: string; newColumn: string; indicators: { id: string; name: string }[] }[];
    pendingSubmit: any; // Store the pending request body
  } | null>(null);

  // Import panel state (always visible)
  const [importPanelTab, setImportPanelTab] = useState<'indicator' | 'dataset'>('indicator');
  const [importSearchQuery, setImportSearchQuery] = useState('');
  // ID mapping for placeholders: maps "ind:name" or "ds:name" to actual IDs
  const [placeholderIdMap, setPlaceholderIdMap] = useState<Map<string, string>>(new Map());
  const [availableIndicators, setAvailableIndicators] = useState<ImportableIndicator[]>([]);
  const [availableDatasets, setAvailableDatasets] = useState<ImportableDataset[]>([]);
  const [loadingImportData, setLoadingImportData] = useState(false);
  const [selectedPlaceholder, setSelectedPlaceholder] = useState<PlaceholderInfo | null>(null);
  const [placeholderDecorations, setPlaceholderDecorations] = useState<string[]>([]);

  // Get display info for a placeholder - uses embedded displayName
  const getPlaceholderDisplayInfo = useCallback((placeholder: PlaceholderInfo): { label: string; detail: string } => {
    if (placeholder.type === 'indicator') {
      // Look up by display name in available indicators
      const ind = availableIndicators.find(i => i.name === placeholder.displayName);
      return {
        label: placeholder.displayName,
        detail: ind?.ownerEmail || ''
      };
    } else {
      // Look up by display name (symbol) in available datasets
      const ds = availableDatasets.find(d => d.symbol === placeholder.displayName);
      return {
        label: placeholder.displayName,
        detail: ds?.name || ''
      };
    }
  }, [availableIndicators, availableDatasets]);

  // Update placeholder decorations in Monaco editor
  const updatePlaceholderDecorations = useCallback(() => {
    if (!editorInstance || !monacoInstance) return;

    const model = editorInstance.getModel();
    if (!model) return;

    const placeholders = findPlaceholders(pythonCode);
    const decorations: any[] = [];

    for (const placeholder of placeholders) {
      const startPos = model.getPositionAt(placeholder.startOffset);
      const endPos = model.getPositionAt(placeholder.endOffset);
      const displayInfo = getPlaceholderDisplayInfo(placeholder);
      const isSelected = selectedPlaceholder &&
        selectedPlaceholder.startOffset === placeholder.startOffset &&
        selectedPlaceholder.endOffset === placeholder.endOffset;

      const baseClass = placeholder.type === 'indicator'
        ? 'import-placeholder-indicator'
        : 'import-placeholder-dataset';
      const className = isSelected ? `${baseClass}-selected` : baseClass;

      decorations.push({
        range: new monacoInstance.Range(
          startPos.lineNumber, startPos.column,
          endPos.lineNumber, endPos.column
        ),
        options: {
          inlineClassName: className,
          hoverMessage: {
            value: placeholder.type === 'indicator'
              ? `**Indicator**: ${displayInfo.label}\n**From**: ${displayInfo.detail}`
              : `**Dataset**: ${displayInfo.label}\n${displayInfo.detail}`
          },
          stickiness: monacoInstance.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
      });
    }

    const newDecorations = editorInstance.deltaDecorations(placeholderDecorations, decorations);
    setPlaceholderDecorations(newDecorations);
  }, [editorInstance, monacoInstance, pythonCode, placeholderDecorations, getPlaceholderDisplayInfo, selectedPlaceholder]);

  // Handle click on placeholder
  const handleEditorClick = useCallback((e: any) => {
    if (!editorInstance || !monacoInstance) return;

    const position = e.target?.position;
    if (!position) return;

    const model = editorInstance.getModel();
    if (!model) return;

    const offset = model.getOffsetAt(position);
    const placeholders = findPlaceholders(pythonCode);

    // Find if click was on a placeholder
    const clickedPlaceholder = placeholders.find(
      p => offset >= p.startOffset && offset < p.endOffset
    );

    if (clickedPlaceholder) {
      setSelectedPlaceholder(clickedPlaceholder);
      // Select the entire placeholder in editor
      const startPos = model.getPositionAt(clickedPlaceholder.startOffset);
      const endPos = model.getPositionAt(clickedPlaceholder.endOffset);
      editorInstance.setSelection(new monacoInstance.Range(
        startPos.lineNumber, startPos.column,
        endPos.lineNumber, endPos.column
      ));
      // Switch panel tab to match placeholder type
      setImportPanelTab(clickedPlaceholder.type);
    } else {
      setSelectedPlaceholder(null);
    }
  }, [editorInstance, monacoInstance, pythonCode]);

  // Insert indicator placeholder at cursor
  const insertIndicatorPlaceholder = useCallback((ind: ImportableIndicator) => {
    if (!editorInstance) return;

    const selection = editorInstance.getSelection();
    if (!selection) return;

    // Add to ID map
    setPlaceholderIdMap(prev => {
      const newMap = new Map(prev);
      newMap.set(`ind:${ind.name}`, ind.id);
      return newMap;
    });

    // Insert visual placeholder
    const placeholder = `◈IND:${ind.name}◈`;
    editorInstance.executeEdits('insert-placeholder', [{
      range: selection,
      text: placeholder,
      forceMoveMarkers: true
    }]);
    editorInstance.focus();

    // Update decorations after a short delay
    setTimeout(() => updatePlaceholderDecorations(), 100);
  }, [editorInstance, updatePlaceholderDecorations]);

  // Insert dataset placeholder at cursor
  const insertDatasetPlaceholder = useCallback((ds: ImportableDataset) => {
    if (!editorInstance) return;

    const selection = editorInstance.getSelection();
    if (!selection) return;

    // Add to ID map
    setPlaceholderIdMap(prev => {
      const newMap = new Map(prev);
      newMap.set(`ds:${ds.symbol}`, ds.id);
      return newMap;
    });

    // Insert visual placeholder
    const placeholder = `◇DS:${ds.symbol}◇`;
    editorInstance.executeEdits('insert-placeholder', [{
      range: selection,
      text: placeholder,
      forceMoveMarkers: true
    }]);
    editorInstance.focus();

    // Update decorations after a short delay
    setTimeout(() => updatePlaceholderDecorations(), 100);
  }, [editorInstance, updatePlaceholderDecorations]);

  // Replace selected placeholder with a new indicator
  const replaceWithIndicator = useCallback((ind: ImportableIndicator) => {
    if (!selectedPlaceholder || !editorInstance || !monacoInstance) return;
    if (selectedPlaceholder.type !== 'indicator') {
      alert('Cannot replace: type mismatch');
      return;
    }

    const model = editorInstance.getModel();
    if (!model) return;

    // Remove old mapping if exists, add new one
    setPlaceholderIdMap(prev => {
      const newMap = new Map(prev);
      // Remove old entry by displayName
      newMap.delete(`ind:${selectedPlaceholder.displayName}`);
      // Add new entry
      newMap.set(`ind:${ind.name}`, ind.id);
      return newMap;
    });

    // Replace at placeholder position
    const startPos = model.getPositionAt(selectedPlaceholder.startOffset);
    const endPos = model.getPositionAt(selectedPlaceholder.endOffset);
    const newPlaceholder = `◈IND:${ind.name}◈`;

    editorInstance.executeEdits('replace-placeholder', [{
      range: new monacoInstance.Range(
        startPos.lineNumber, startPos.column,
        endPos.lineNumber, endPos.column
      ),
      text: newPlaceholder,
      forceMoveMarkers: true
    }]);

    setSelectedPlaceholder(null);
    setTimeout(() => updatePlaceholderDecorations(), 100);
  }, [selectedPlaceholder, editorInstance, monacoInstance, updatePlaceholderDecorations]);

  // Replace selected placeholder with a new dataset
  const replaceWithDataset = useCallback((ds: ImportableDataset) => {
    if (!selectedPlaceholder || !editorInstance || !monacoInstance) return;
    if (selectedPlaceholder.type !== 'dataset') {
      alert('Cannot replace: type mismatch');
      return;
    }

    const model = editorInstance.getModel();
    if (!model) return;

    // Remove old mapping if exists, add new one
    setPlaceholderIdMap(prev => {
      const newMap = new Map(prev);
      newMap.delete(`ds:${selectedPlaceholder.displayName}`);
      newMap.set(`ds:${ds.symbol}`, ds.id);
      return newMap;
    });

    // Replace at placeholder position
    const startPos = model.getPositionAt(selectedPlaceholder.startOffset);
    const endPos = model.getPositionAt(selectedPlaceholder.endOffset);
    const newPlaceholder = `◇DS:${ds.symbol}◇`;

    editorInstance.executeEdits('replace-placeholder', [{
      range: new monacoInstance.Range(
        startPos.lineNumber, startPos.column,
        endPos.lineNumber, endPos.column
      ),
      text: newPlaceholder,
      forceMoveMarkers: true
    }]);

    setSelectedPlaceholder(null);
    setTimeout(() => updatePlaceholderDecorations(), 100);
  }, [selectedPlaceholder, editorInstance, monacoInstance, updatePlaceholderDecorations]);

  // Update decorations when code changes
  useEffect(() => {
    if (editorInstance && monacoInstance) {
      updatePlaceholderDecorations();
    }
  }, [pythonCode, editorInstance, monacoInstance]);

  // Set up click listener for placeholder selection
  useEffect(() => {
    if (!editorInstance || !monacoInstance) return;

    const disposable = editorInstance.onMouseDown((e: any) => {
      if (e.target?.type === monacoInstance.editor.MouseTargetType.CONTENT_TEXT) {
        const position = e.target.position;
        if (!position) return;

        const model = editorInstance.getModel();
        if (!model) return;

        const code = model.getValue();
        const offset = model.getOffsetAt(position);
        const placeholders = findPlaceholders(code);

        // Find if click was on a placeholder
        const clickedPlaceholder = placeholders.find(
          p => offset >= p.startOffset && offset < p.endOffset
        );

        if (clickedPlaceholder) {
          setSelectedPlaceholder(clickedPlaceholder);
          // Select the entire placeholder in editor
          const startPos = model.getPositionAt(clickedPlaceholder.startOffset);
          const endPos = model.getPositionAt(clickedPlaceholder.endOffset);
          editorInstance.setSelection(new monacoInstance.Range(
            startPos.lineNumber, startPos.column,
            endPos.lineNumber, endPos.column
          ));
          // Switch panel tab to match placeholder type
          setImportPanelTab(clickedPlaceholder.type);
        } else {
          setSelectedPlaceholder(null);
        }
      }
    });

    return () => disposable.dispose();
  }, [editorInstance, monacoInstance]);

  // Fetch available indicators and datasets when modal opens
  useEffect(() => {
    if (isOpen && availableIndicators.length === 0 && availableDatasets.length === 0) {
      setLoadingImportData(true);

      Promise.all([
        fetch('/api/indicators').then(res => res.json()),
        fetch('/api/datasets').then(res => res.json())
      ]).then(([indicatorsData, datasetsData]) => {
        if (indicatorsData.indicators) {
          setAvailableIndicators(indicatorsData.indicators.map((ind: any) => ({
            id: ind.id,
            name: ind.name,
            ownerEmail: ind.creatorEmail || 'me',
            description: ind.description || '',
            isOwner: ind.isOwner,
            outputColumn: ind.outputColumn,
          })));
        }
        if (datasetsData.datasets) {
          setAvailableDatasets(datasetsData.datasets.map((ds: any) => ({
            id: ds.id,
            symbol: ds.symbol || ds.code,
            name: ds.name,
            dataSource: ds.dataSource,
          })));
        }
      }).catch(err => {
        console.error('Failed to load import data:', err);
      }).finally(() => {
        setLoadingImportData(false);
      });
    }
  }, [isOpen, availableIndicators.length, availableDatasets.length]);

  // Load groups on mount (includes both custom and data source groups)
  useEffect(() => {
    if (isOpen) {
      fetch('/api/groups')
        .then((res) => res.json())
        .then((data) => {
          setGroups(data.groups || []);
        })
        .catch((err) => {
          console.error('Failed to load groups:', err);
        });
    }
  }, [isOpen]);

  // Track the raw Python code before transformation (for when indicators aren't loaded yet)
  const [rawPythonCode, setRawPythonCode] = useState<string | null>(null);

  useEffect(() => {
    if (indicator) {
      setIndicatorType(indicator.isGroup ? 'mytt_group' : 'custom');
      setName(indicator.name);
      setDescription(indicator.description);
      setOutputColumn(indicator.outputColumn);
      setGroupName(indicator.groupName || '');
      setExpectedOutputs(indicator.expectedOutputs || ['']);
      // Store raw code - will be transformed when available data is loaded
      setRawPythonCode(indicator.pythonCode);
      setExternalDatasets(indicator.externalDatasets || {});
      setPeriod(indicator.period || 'daily');
    } else {
      setIndicatorType('custom');
      setName('');
      setDescription('');
      setOutputColumn('');
      setGroupName('');
      setExpectedOutputs(['']);
      setPythonCode('');
      setRawPythonCode(null);
      setExternalDatasets({});
      setPeriod('daily');
      setPlaceholderIdMap(new Map());
    }
    setError(null);
    setValidationMessage(null);
    setIsLoading(false);
    setIsValidating(false);
    setEditingDataset(null);
    setTempDatasetConfig(null);
  }, [indicator, isOpen]);

  // Transform raw Python code to visual placeholders when available data is loaded
  useEffect(() => {
    if (rawPythonCode && availableIndicators.length > 0) {
      const { code, idMap } = transformCodeToPlaceholders(
        rawPythonCode,
        availableIndicators.map(i => ({ id: i.id, name: i.name })),
        availableDatasets.map(d => ({ id: d.id, symbol: d.symbol }))
      );
      setPythonCode(code);
      setPlaceholderIdMap(idMap);
      setRawPythonCode(null); // Clear raw code after transformation
    }
  }, [rawPythonCode, availableIndicators, availableDatasets]);

  // Auto-fill output column or groupName from name
  useEffect(() => {
    if (!indicator && name) {
      const normalized = name.replace(/\s+/g, '_');
      if (indicatorType === 'mytt_group' && !groupName) {
        setGroupName(normalized);
      } else if (indicatorType === 'custom' && !outputColumn) {
        setOutputColumn(normalized);
      }
    }
  }, [name, indicator, outputColumn, groupName, indicatorType]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.py')) {
      setError('Please upload a .py file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setPythonCode(content);
      setActiveTab('text');
    };
    reader.readAsText(file);
  };

  const handleValidate = async () => {
    setIsValidating(true);
    setValidationMessage(null);
    setError(null);

    try {
      // Filter out incomplete external datasets
      const validExternalDatasets = Object.fromEntries(
        Object.entries(externalDatasets).filter(
          ([_, dataset]) => dataset.groupId && dataset.datasetName
        )
      );

      // Transform placeholders to actual Python import code before validation
      const codeToValidate = transformPlaceholdersToCode(pythonCode, placeholderIdMap);

      const requestBody: any = {
        pythonCode: codeToValidate,
        isGroup: indicatorType === 'mytt_group'
      };

      if (Object.keys(validExternalDatasets).length > 0) {
        requestBody.externalDatasets = validExternalDatasets;
      }

      const response = await fetch('/api/validate-indicator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (data.valid) {
        setValidationMessage('✓ Code is valid!');
        setErrorDetails(null);
      } else {
        setError(data.error || 'Validation failed');
        setErrorDetails(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation error');
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setValidationMessage(null);

    if (!name || !description || !pythonCode) {
      setError('Please fill in all required fields');
      return;
    }

    // Validate group-specific fields
    if (indicatorType === 'mytt_group') {
      if (!groupName) {
        setError('Group name is required for MyTT indicators');
        return;
      }

      const filteredOutputs = expectedOutputs.filter(o => o.trim() !== '');
      if (filteredOutputs.length === 0) {
        setError('At least one expected output is required for MyTT indicators');
        return;
      }
    }

    setIsLoading(true);

    try {
      const url = indicator
        ? `/api/indicators/${indicator.id}`
        : '/api/indicators';
      const method = indicator ? 'PUT' : 'POST';

      // Transform placeholders to actual Python import code before saving
      const codeToSave = transformPlaceholdersToCode(pythonCode, placeholderIdMap);

      const requestBody: any = {
        name,
        description,
        pythonCode: codeToSave,
        period,
      };

      if (indicatorType === 'mytt_group') {
        requestBody.isGroup = true;
        requestBody.groupName = groupName;
        requestBody.expectedOutputs = expectedOutputs.filter(o => o.trim() !== '');
      } else {
        requestBody.isGroup = false;
        requestBody.outputColumn = outputColumn || name;
      }

      // Filter out incomplete external datasets
      const validExternalDatasets = Object.fromEntries(
        Object.entries(externalDatasets).filter(
          ([_, dataset]) => dataset.groupId && dataset.datasetName
        )
      );

      // Always send externalDatasets (even if empty) so the API knows to clear it
      // Use null to signal "clear all external datasets"
      requestBody.externalDatasets = Object.keys(validExternalDatasets).length > 0
        ? validExternalDatasets
        : null;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        // Check if this is a column rename that affects dependent indicators
        if (data.error === 'Column rename affects dependent indicators' && data.requiresAutoFix) {
          // Store the pending request and show the modal
          setColumnRenameData({
            columnRenames: data.columnRenames,
            pendingSubmit: requestBody,
          });
          setShowColumnRenameModal(true);
          setIsLoading(false);
          return;
        }

        // Check if this is a "columns have dependents" error
        if (data.error === 'Columns have dependent indicators' && data.dependentColumns) {
          // Build confirmation message
          const dependentInfo = data.dependentColumns as { column: string; indicators: { id: string; name: string }[] }[];
          const lines = dependentInfo.map(({ column, indicators }) => {
            const indicatorNames = indicators.map(ind => ind.name).join(', ');
            return `  • ${column} is used by: ${indicatorNames}`;
          });

          const confirmMessage = `The following columns are used by other indicators:\n${lines.join('\n')}\n\nDo you want to remove them anyway? This may break the dependent indicators.`;

          if (confirm(confirmMessage)) {
            // Retry with force=true
            const forceResponse = await fetch(`${url}?force=true`, {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestBody),
            });

            const forceData = await forceResponse.json();

            if (!forceResponse.ok) {
              setError(forceData.message || 'Failed to save indicator');
              setIsLoading(false);
              return;
            }

            setIsLoading(false);
            onSuccess(forceData.indicator || forceData, 'indicator');
            return;
          } else {
            setIsLoading(false);
            return;
          }
        }

        setError(data.message || 'Failed to save indicator');
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      onSuccess(data.indicator || data, 'indicator');

      // Check for orphaned columns after successful save
      checkForOrphanedColumns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setIsLoading(false);
    }
  };

  // Check for orphaned columns in CSV files
  const checkForOrphanedColumns = async () => {
    try {
      const response = await fetch('/api/check-orphaned-columns');
      const data = await response.json();

      if (data.hasOrphanedColumns && data.orphanedColumns.length > 0) {
        setOrphanedColumnsData({
          orphanedColumns: data.orphanedColumns,
          dependentIndicators: data.dependentIndicators || [],
        });
        setShowOrphanedColumnsModal(true);
      }
    } catch (err) {
      console.error('Error checking for orphaned columns:', err);
    }
  };

  // Handle orphaned columns cleanup
  const handleCleanupOrphanedColumns = async () => {
    if (!orphanedColumnsData) return;

    setIsCleaningOrphans(true);

    try {
      // Collect all indicator IDs that need to be deleted
      const indicatorIdsToDelete: string[] = [];
      orphanedColumnsData.dependentIndicators.forEach(({ indicators }) => {
        indicators.forEach(ind => {
          if (!indicatorIdsToDelete.includes(ind.id)) {
            indicatorIdsToDelete.push(ind.id);
          }
        });
      });

      const response = await fetch('/api/check-orphaned-columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orphanedColumns: orphanedColumnsData.orphanedColumns,
          indicatorIdsToDelete,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        console.log('Cleaned up orphaned columns:', data);
        setShowOrphanedColumnsModal(false);
        setOrphanedColumnsData(null);
        onSuccess(); // Refresh the indicator list (no new item here, just cleanup)
      } else {
        setError(data.message || 'Failed to cleanup orphaned columns');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cleaning up orphaned columns');
    } finally {
      setIsCleaningOrphans(false);
    }
  };

  // Cancel orphaned columns cleanup
  const handleCancelOrphanedCleanup = () => {
    setShowOrphanedColumnsModal(false);
    setOrphanedColumnsData(null);
  };

  // Handle column rename auto-fix
  const handleAutoFixColumnRename = async () => {
    if (!columnRenameData || !indicator) return;

    setIsLoading(true);

    try {
      const url = `/api/indicators/${indicator.id}?autoFix=true`;

      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(columnRenameData.pendingSubmit),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Failed to save indicator');
        setIsLoading(false);
        setShowColumnRenameModal(false);
        setColumnRenameData(null);
        return;
      }

      setIsLoading(false);
      setShowColumnRenameModal(false);
      setColumnRenameData(null);
      onSuccess(data.indicator || data, 'indicator');

      // Check for orphaned columns after successful save
      checkForOrphanedColumns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setIsLoading(false);
      setShowColumnRenameModal(false);
      setColumnRenameData(null);
    }
  };

  // Cancel column rename
  const handleCancelColumnRename = () => {
    setShowColumnRenameModal(false);
    setColumnRenameData(null);
  };

  const handleInsertTemplate = () => {
    setPythonCode(CODE_TEMPLATE);
  };

  const handleInsertMyTTTemplate = () => {
    setPythonCode(MYTT_TEMPLATE);
  };

  // Basic syntax checking with line numbers
  const checkBasicSyntax = (code: string) => {
    const warnings: string[] = [];
    const markers: any[] = [];

    if (!code.trim()) {
      return { warnings, markers };
    }

    const lines = code.split('\n');

    // Check for calculate function definition
    const hasCalculate = code.includes('def calculate(data)');
    if (!hasCalculate) {
      warnings.push('Missing "def calculate(data):" function definition');
      markers.push({
        severity: 4, // Warning
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 100,
        message: 'Missing "def calculate(data):" function definition'
      });
    }

    // Check for return statement
    const hasReturn = code.includes('return');
    if (!hasReturn) {
      warnings.push('Missing return statement');
      const lastLine = lines.length;
      markers.push({
        severity: 4, // Warning
        startLineNumber: lastLine,
        startColumn: 1,
        endLineNumber: lastLine,
        endColumn: lines[lastLine - 1]?.length || 1,
        message: 'Missing return statement'
      });
    }

    // Check for balanced parentheses
    const openParen = (code.match(/\(/g) || []).length;
    const closeParen = (code.match(/\)/g) || []).length;
    if (openParen !== closeParen) {
      const msg = `Unbalanced parentheses: ${openParen} open, ${closeParen} close`;
      warnings.push(msg);

      // Find line with imbalance
      let balance = 0;
      let errorLine = 1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        balance += (line.match(/\(/g) || []).length;
        balance -= (line.match(/\)/g) || []).length;
        if (balance < 0) {
          errorLine = i + 1;
          break;
        }
      }

      markers.push({
        severity: 8, // Error
        startLineNumber: errorLine,
        startColumn: 1,
        endLineNumber: errorLine,
        endColumn: lines[errorLine - 1]?.length || 1,
        message: msg
      });
    }

    // Check for balanced brackets
    const openBracket = (code.match(/\[/g) || []).length;
    const closeBracket = (code.match(/\]/g) || []).length;
    if (openBracket !== closeBracket) {
      const msg = `Unbalanced brackets: ${openBracket} open, ${closeBracket} close`;
      warnings.push(msg);
      markers.push({
        severity: 8,
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 100,
        message: msg
      });
    }

    // Check for balanced braces
    const openBrace = (code.match(/\{/g) || []).length;
    const closeBrace = (code.match(/\}/g) || []).length;
    if (openBrace !== closeBrace) {
      const msg = `Unbalanced braces: ${openBrace} open, ${closeBrace} close`;
      warnings.push(msg);
      markers.push({
        severity: 8,
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 100,
        message: msg
      });
    }

    return { warnings, markers };
  };

  // Check syntax when code changes and update editor markers
  useEffect(() => {
    if (pythonCode && editorInstance && monacoInstance) {
      const { warnings, markers } = checkBasicSyntax(pythonCode);
      setSyntaxWarnings(warnings);

      // Set markers in Monaco editor
      const model = editorInstance.getModel();
      if (model) {
        monacoInstance.editor.setModelMarkers(model, 'python-syntax', markers);
      }
    } else if (editorInstance && monacoInstance) {
      // Clear markers if no code
      const model = editorInstance.getModel();
      if (model) {
        monacoInstance.editor.setModelMarkers(model, 'python-syntax', []);
      }
      setSyntaxWarnings([]);
    }
  }, [pythonCode, editorInstance, monacoInstance]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />

      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[95vw] max-w-[1400px] h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 className="text-lg font-bold dark:text-white">
            {readOnly ? 'View Indicator' : (indicator ? 'Edit Indicator' : 'Create New Indicator')}
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleValidate}
              disabled={isValidating || !pythonCode}
              className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
            >
              {isValidating ? 'Validating...' : 'Validate'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            {!readOnly && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isLoading || !name || !description || !pythonCode}
                className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {isLoading ? 'Saving...' : indicator ? 'Update' : 'Create'}
              </button>
            )}
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="mx-4 mt-2 p-2 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-400 rounded text-sm flex-shrink-0">
            {error}
          </div>
        )}
        {validationMessage && (
          <div className="mx-4 mt-2 p-2 bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-600 text-green-700 dark:text-green-400 rounded text-sm flex-shrink-0">
            {validationMessage}
          </div>
        )}

        {/* Main Content - Three Columns */}
        <div className="flex flex-1 overflow-hidden p-4 gap-4">
          {/* Left Panel - Settings */}
          <div className="w-64 flex-shrink-0 overflow-y-auto space-y-3">
            {/* Type */}
            <div>
              <label className="block text-xs font-medium mb-1 dark:text-white">Type</label>
              <select
                value={indicatorType}
                onChange={(e) => setIndicatorType(e.target.value as 'custom' | 'mytt_group')}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                disabled={isLoading || !!indicator}
              >
                <option value="custom">Custom (Single)</option>
                <option value="mytt_group">MyTT Group</option>
              </select>
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-medium mb-1 dark:text-white">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                placeholder="e.g., SMA_20"
                disabled={isLoading || readOnly}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium mb-1 dark:text-white">Description *</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                placeholder="Brief description"
                rows={2}
                disabled={isLoading || readOnly}
              />
            </div>

            {/* Period */}
            <div>
              <label className="block text-xs font-medium mb-1 dark:text-white">Period</label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                disabled={isLoading || readOnly}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>

            {/* Output Settings */}
            {indicatorType === 'custom' ? (
              <div>
                <label className="block text-xs font-medium mb-1 dark:text-white">Output Column</label>
                <input
                  type="text"
                  value={outputColumn}
                  onChange={(e) => setOutputColumn(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                  placeholder="Auto from name"
                  disabled={isLoading || readOnly}
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium mb-1 dark:text-white">Group Name *</label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                    placeholder="e.g., MACD"
                    disabled={isLoading || readOnly}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 dark:text-white">Expected Outputs *</label>
                  {expectedOutputs.map((output, idx) => (
                    <div key={idx} className="flex gap-1 mb-1">
                      <input
                        type="text"
                        value={output}
                        onChange={(e) => {
                          const newOutputs = [...expectedOutputs];
                          newOutputs[idx] = e.target.value;
                          setExpectedOutputs(newOutputs);
                        }}
                        placeholder={`Output ${idx + 1}`}
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                        disabled={isLoading || readOnly}
                      />
                      {expectedOutputs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setExpectedOutputs(expectedOutputs.filter((_, i) => i !== idx))}
                          className="px-2 text-red-500 hover:text-red-700"
                          disabled={isLoading || readOnly}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setExpectedOutputs([...expectedOutputs, ''])}
                    className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    disabled={isLoading || readOnly}
                  >
                    + Add Output
                  </button>
                </div>
              </>
            )}

            {/* Template Button */}
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              {indicatorType === 'custom' ? (
                <button
                  type="button"
                  onClick={handleInsertTemplate}
                  className="w-full px-3 py-1.5 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Insert Template
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleInsertMyTTTemplate}
                  className="w-full px-3 py-1.5 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Insert MyTT Template
                </button>
              )}
            </div>
          </div>

          {/* Center - Code Editor */}
          <div className="flex-1 min-w-0">
            <div className="h-full border border-gray-300 dark:border-gray-600 rounded overflow-hidden">
              <Editor
                height="100%"
                defaultLanguage="python"
                value={pythonCode}
                onChange={(value) => setPythonCode(value || '')}
                onMount={(editor, monaco) => {
                  setEditorInstance(editor);
                  setMonacoInstance(monaco);
                }}
                theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 4,
                  insertSpaces: true,
                  wordWrap: 'off',
                  readOnly: isLoading || readOnly,
                  formatOnPaste: true,
                  formatOnType: true,
                  suggestOnTriggerCharacters: true,
                  quickSuggestions: true,
                  parameterHints: { enabled: true },
                  folding: true,
                  bracketPairColorization: { enabled: true },
                  guides: {
                    indentation: true,
                    bracketPairs: true
                  }
                }}
                loading={<div className="p-4 text-gray-500">Loading editor...</div>}
              />
            </div>
          </div>

          {/* Right Panel - Import (Always Visible) */}
          <div className="w-64 flex-shrink-0 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 flex flex-col">
            {/* Panel Header */}
            <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="text-sm font-semibold dark:text-white mb-2">Import</div>
              {/* Tabs */}
              <div className="flex border-b border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setImportPanelTab('indicator')}
                  className={`flex-1 px-2 py-1 text-xs font-medium ${
                    importPanelTab === 'indicator'
                      ? 'border-b-2 border-purple-600 text-purple-600'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  Indicator
                </button>
                <button
                  type="button"
                  onClick={() => setImportPanelTab('dataset')}
                  className={`flex-1 px-2 py-1 text-xs font-medium ${
                    importPanelTab === 'dataset'
                      ? 'border-b-2 border-green-600 text-green-600'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  Dataset
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <input
                type="text"
                placeholder={`Search ${importPanelTab}s...`}
                value={importSearchQuery}
                onChange={(e) => setImportSearchQuery(e.target.value)}
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
              />
            </div>

            {/* Selected Placeholder Info */}
            {selectedPlaceholder && (
              <div className="p-2 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/30 flex-shrink-0">
                <div className="text-xs text-blue-700 dark:text-blue-300 mb-1">
                  Selected: {(() => {
                    const info = getPlaceholderDisplayInfo(selectedPlaceholder);
                    return selectedPlaceholder.type === 'indicator'
                      ? `${info.label} (${info.detail})`
                      : `DS: ${info.label}`;
                  })()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Click an item below to replace
                </div>
              </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2">
              {loadingImportData ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-4">
                  Loading...
                </div>
              ) : importPanelTab === 'indicator' ? (
                <>
                  {/* My Indicators */}
                  <div className="mb-3">
                            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                              My Indicators
                            </div>
                            {availableIndicators
                              .filter(ind => ind.isOwner)
                              .filter(ind => !importSearchQuery ||
                                ind.name.toLowerCase().includes(importSearchQuery.toLowerCase()))
                              .map(ind => (
                                <div
                                  key={ind.id}
                                  className="flex items-center justify-between p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm"
                                >
                                  <div className="flex-1 truncate dark:text-white">{ind.name}</div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (selectedPlaceholder && selectedPlaceholder.type === 'indicator') {
                                        replaceWithIndicator(ind);
                                      } else {
                                        insertIndicatorPlaceholder(ind);
                                      }
                                    }}
                                    className={`px-2 py-0.5 text-xs rounded ${
                                      selectedPlaceholder && selectedPlaceholder.type === 'indicator'
                                        ? 'bg-orange-500 hover:bg-orange-600 text-white'
                                        : 'bg-purple-500 hover:bg-purple-600 text-white'
                                    }`}
                                  >
                                    {selectedPlaceholder && selectedPlaceholder.type === 'indicator' ? 'Replace' : 'Import'}
                                  </button>
                                </div>
                              ))}
                          </div>

                          {/* Subscribed Indicators */}
                          <div>
                            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                              Subscribed
                            </div>
                            {availableIndicators
                              .filter(ind => !ind.isOwner)
                              .filter(ind => !importSearchQuery ||
                                ind.name.toLowerCase().includes(importSearchQuery.toLowerCase()) ||
                                ind.ownerEmail.toLowerCase().includes(importSearchQuery.toLowerCase()))
                              .map(ind => (
                                <div
                                  key={ind.id}
                                  className="flex items-center justify-between p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm"
                                >
                                  <div className="flex-1 truncate">
                                    <div className="dark:text-white">{ind.name}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{ind.ownerEmail}</div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (selectedPlaceholder && selectedPlaceholder.type === 'indicator') {
                                        replaceWithIndicator(ind);
                                      } else {
                                        insertIndicatorPlaceholder(ind);
                                      }
                                    }}
                                    className={`px-2 py-0.5 text-xs rounded ${
                                      selectedPlaceholder && selectedPlaceholder.type === 'indicator'
                                        ? 'bg-orange-500 hover:bg-orange-600 text-white'
                                        : 'bg-purple-500 hover:bg-purple-600 text-white'
                                    }`}
                                  >
                                    {selectedPlaceholder && selectedPlaceholder.type === 'indicator' ? 'Replace' : 'Import'}
                                  </button>
                                </div>
                              ))}
                            {availableIndicators.filter(ind => !ind.isOwner).length === 0 && (
                              <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
                                No subscribed indicators
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Datasets */}
                          {availableDatasets
                            .filter(ds => !importSearchQuery ||
                              ds.symbol.toLowerCase().includes(importSearchQuery.toLowerCase()) ||
                              ds.name.toLowerCase().includes(importSearchQuery.toLowerCase()))
                            .map(ds => (
                              <div
                                key={ds.id}
                                className="flex items-center justify-between p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm"
                              >
                                <div className="flex-1 truncate">
                                  <div className="dark:text-white">{ds.symbol}</div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{ds.name}</div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (selectedPlaceholder && selectedPlaceholder.type === 'dataset') {
                                      replaceWithDataset(ds);
                                    } else {
                                      insertDatasetPlaceholder(ds);
                                    }
                                  }}
                                  className={`px-2 py-0.5 text-xs rounded ${
                                    selectedPlaceholder && selectedPlaceholder.type === 'dataset'
                                      ? 'bg-orange-500 hover:bg-orange-600 text-white'
                                      : 'bg-green-500 hover:bg-green-600 text-white'
                                  }`}
                                >
                                  {selectedPlaceholder && selectedPlaceholder.type === 'dataset' ? 'Replace' : 'Import'}
                                </button>
                              </div>
                            ))}
                          {availableDatasets.length === 0 && (
                            <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
                              No datasets available
                            </div>
                          )}
                        </>
                      )}
            </div>
          </div>
        </div>
      </div>

      {/* Orphaned Columns Confirmation Modal */}
      {showOrphanedColumnsModal && orphanedColumnsData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-orange-600 dark:text-orange-400 mb-4 flex items-center gap-2">
                <span>⚠️</span> Orphaned Columns Detected
              </h3>

              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                The following columns exist in your CSV files but don&apos;t correspond to any defined indicator:
              </p>

              <div className="bg-gray-50 dark:bg-gray-700 rounded p-3 mb-4 max-h-32 overflow-y-auto">
                <div className="flex flex-wrap gap-2">
                  {orphanedColumnsData.orphanedColumns.map((col, idx) => (
                    <span key={idx} className="px-2 py-1 bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300 text-xs rounded">
                      {col}
                    </span>
                  ))}
                </div>
              </div>

              {orphanedColumnsData.dependentIndicators.length > 0 && (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                    The following indicators depend on these orphaned columns and will also be deleted:
                  </p>
                  <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded p-3 mb-4 max-h-40 overflow-y-auto">
                    {orphanedColumnsData.dependentIndicators.map(({ column, indicators }, idx) => (
                      <div key={idx} className="mb-2 last:mb-0">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                          Column: <span className="font-mono text-red-600 dark:text-red-400">{column}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {indicators.map((ind, indIdx) => (
                            <span key={indIdx} className="px-2 py-0.5 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 text-xs rounded">
                              {ind.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Do you want to remove these orphaned columns from all datasets?
              </p>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCancelOrphanedCleanup}
                  disabled={isCleaningOrphans}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCleanupOrphanedColumns}
                  disabled={isCleaningOrphans}
                  className="px-4 py-2 text-sm bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
                >
                  {isCleaningOrphans ? 'Cleaning...' : 'Continue & Remove'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Column Rename Auto-Fix Modal */}
      {showColumnRenameModal && columnRenameData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-blue-600 dark:text-blue-400 mb-4 flex items-center gap-2">
                <span>🔄</span> Column Name Change Detected
              </h3>

              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                You are changing column names that are used by other indicators. Do you want to automatically update their code?
              </p>

              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded p-3 mb-4 max-h-60 overflow-y-auto">
                {columnRenameData.columnRenames.map(({ column, newColumn, indicators }, idx) => (
                  <div key={idx} className="mb-3 last:mb-0">
                    <div className="text-sm mb-2">
                      <span className="font-mono text-red-600 dark:text-red-400 line-through">{column}</span>
                      <span className="mx-2 text-gray-500">→</span>
                      <span className="font-mono text-green-600 dark:text-green-400">{newColumn}</span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Used by:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {indicators.map((ind, indIdx) => (
                        <span key={indIdx} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs rounded">
                          {ind.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Click &quot;Auto-Fix&quot; to update all references in the dependent indicators&apos; code automatically.
              </p>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCancelColumnRename}
                  disabled={isLoading || readOnly}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAutoFixColumnRename}
                  disabled={isLoading || readOnly}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {isLoading ? 'Updating...' : 'Auto-Fix & Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
