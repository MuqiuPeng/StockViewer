'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { findPlaceholders, buildPlaceholderText, BASE_COLUMNS } from '@/components/editor/placeholder-utils';
import type {
  PlaceholderInfo,
  ImportableItem,
  ImportableDatasetColumn,
  PickerState,
  PickerItem,
  DataSourcesConfig,
  VisualBlocksAPI,
} from '@/components/editor/types';

interface UseMonacoVisualBlocksConfig {
  code: string;
  onCodeChange: (code: string) => void;
  dataSources: DataSourcesConfig;
  mode: 'indicator' | 'strategy';
  readOnly?: boolean;
  onExternalDatasetChanged?: (datasets: Record<string, { groupId: string; datasetName: string }>) => void;
}

export function useMonacoVisualBlocks(config: UseMonacoVisualBlocksConfig): VisualBlocksAPI {
  const { code, onCodeChange, dataSources, readOnly } = config;

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationIdsRef = useRef<string[]>([]);
  const pickerWidgetRef = useRef<any>(null);
  const pickerContainerRef = useRef<HTMLDivElement | null>(null);

  const [selectedPlaceholder, setSelectedPlaceholder] = useState<PlaceholderInfo | null>(null);
  const [pickerState, setPickerState] = useState<PickerState>({
    isOpen: false,
    mode: 'insert',
    position: null,
    anchorPlaceholder: null,
  });

  const closePicker = useCallback(() => {
    setPickerState({
      isOpen: false,
      mode: 'insert',
      position: null,
      anchorPlaceholder: null,
    });
    setSelectedPlaceholder(null);

    // Remove content widget
    const editor = editorRef.current;
    if (editor && pickerWidgetRef.current) {
      editor.removeContentWidget(pickerWidgetRef.current);
      pickerWidgetRef.current = null;
    }
  }, []);

  const openPicker = useCallback((
    mode: 'insert' | 'replace',
    position: { lineNumber: number; column: number },
    anchorPlaceholder: PlaceholderInfo | null = null,
  ) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    // Remove existing widget
    if (pickerWidgetRef.current) {
      editor.removeContentWidget(pickerWidgetRef.current);
    }

    // Create container div if needed
    if (!pickerContainerRef.current) {
      pickerContainerRef.current = document.createElement('div');
      pickerContainerRef.current.className = 'visual-block-picker-container';
    }

    // Create content widget
    const widget = {
      getId: () => 'data-source-picker-widget',
      getDomNode: () => pickerContainerRef.current!,
      getPosition: () => ({
        position: { lineNumber: position.lineNumber, column: position.column },
        preference: [monaco.editor.ContentWidgetPositionPreference.BELOW],
      }),
    };

    pickerWidgetRef.current = widget;
    editor.addContentWidget(widget);

    setPickerState({
      isOpen: true,
      mode,
      position,
      anchorPlaceholder,
    });
  }, []);

  // Insert a placeholder at the current cursor position
  const insertPlaceholder = useCallback((item: PickerItem) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const placeholderText = buildPlaceholderText(item.type, {
      column: item.column,
      indicatorName: item.indicatorName,
      columnName: item.columnName,
      isGroupColumn: item.isGroupColumn,
      datasetSymbol: item.datasetSymbol,
      datasetColumn: item.datasetColumn,
    });

    if (!placeholderText) return;

    if (pickerState.mode === 'replace' && pickerState.anchorPlaceholder) {
      // Replace existing placeholder
      const model = editor.getModel();
      if (!model) return;

      const ph = pickerState.anchorPlaceholder;
      const startPos = model.getPositionAt(ph.startOffset);
      const endPos = model.getPositionAt(ph.endOffset);

      editor.executeEdits('replace-placeholder', [{
        range: new monaco.Range(
          startPos.lineNumber, startPos.column,
          endPos.lineNumber, endPos.column
        ),
        text: placeholderText,
        forceMoveMarkers: true,
      }]);
    } else {
      // Insert at cursor
      const selection = editor.getSelection();
      if (!selection) return;

      // Check if we need to remove the trigger character '@'
      const model = editor.getModel();
      if (model) {
        const cursorPos = selection.getPosition();
        const offset = model.getOffsetAt(cursorPos);
        const textBefore = model.getValue().substring(Math.max(0, offset - 1), offset);

        if (textBefore === '@') {
          // Remove the '@' and insert placeholder
          const startPos = model.getPositionAt(offset - 1);
          editor.executeEdits('insert-placeholder', [{
            range: new monaco.Range(
              startPos.lineNumber, startPos.column,
              cursorPos.lineNumber, cursorPos.column
            ),
            text: placeholderText,
            forceMoveMarkers: true,
          }]);
        } else {
          // Just insert at cursor
          const insertRange = new monaco.Range(
            cursorPos.lineNumber, cursorPos.column,
            cursorPos.lineNumber, cursorPos.column
          );
          editor.executeEdits('insert-placeholder', [{
            range: insertRange,
            text: placeholderText,
            forceMoveMarkers: true,
          }]);
        }
      }
    }

    editor.focus();
    closePicker();
  }, [pickerState, closePicker]);

  // Update decorations to render visual chips
  const updateDecorations = useCallback(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const model = editor.getModel();
    if (!model) return;

    const currentCode = model.getValue();
    const placeholders = findPlaceholders(currentCode);
    const decorations: any[] = [];

    for (const placeholder of placeholders) {
      const startPos = model.getPositionAt(placeholder.startOffset);
      const endPos = model.getPositionAt(placeholder.endOffset);

      const isSelected = selectedPlaceholder &&
        selectedPlaceholder.startOffset === placeholder.startOffset &&
        selectedPlaceholder.endOffset === placeholder.endOffset;

      // Determine chip class based on type
      let chipClass = 'visual-block-chip visual-block-chip--base';
      if (placeholder.type === 'indicator') {
        chipClass = 'visual-block-chip visual-block-chip--indicator';
      } else if (placeholder.type === 'dataset') {
        chipClass = 'visual-block-chip visual-block-chip--dataset';
      }

      if (isSelected) {
        chipClass += ' visual-block-chip--selected';
      }

      decorations.push({
        range: new monaco.Range(
          startPos.lineNumber, startPos.column,
          endPos.lineNumber, endPos.column
        ),
        options: {
          inlineClassName: 'visual-block-hidden-text',
          before: {
            content: placeholder.displayName,
            inlineClassName: chipClass,
            cursorStops: 2, // InjectedTextCursorStops.Both
          },
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          hoverMessage: {
            value: `**${placeholder.type === 'dataset' ? 'Dataset' : placeholder.type === 'indicator' ? 'Indicator' : 'Column'}**: ${placeholder.displayName}`
          },
        },
      });
    }

    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, decorations);
  }, [selectedPlaceholder]);

  // Update decorations when code or selection changes
  useEffect(() => {
    updateDecorations();
  }, [code, updateDecorations]);

  // Set up editor event listeners
  const setupEditorListeners = useCallback((editor: any, monaco: any) => {
    // Click handler - open picker on chip click
    const clickDisposable = editor.onMouseDown((e: any) => {
      if (e.target?.type === monaco.editor.MouseTargetType.CONTENT_TEXT ||
          e.target?.type === monaco.editor.MouseTargetType.CONTENT_EMPTY) {
        const position = e.target.position;
        if (!position) return;

        const model = editor.getModel();
        if (!model) return;

        const offset = model.getOffsetAt(position);
        const currentCode = model.getValue();
        const placeholders = findPlaceholders(currentCode);

        const clickedPlaceholder = placeholders.find(
          p => offset >= p.startOffset && offset < p.endOffset
        );

        if (clickedPlaceholder) {
          setSelectedPlaceholder(clickedPlaceholder);

          // Select the entire placeholder
          const startPos = model.getPositionAt(clickedPlaceholder.startOffset);
          const endPos = model.getPositionAt(clickedPlaceholder.endOffset);
          editor.setSelection(new monaco.Range(
            startPos.lineNumber, startPos.column,
            endPos.lineNumber, endPos.column
          ));

          // Open picker in replace mode
          if (!readOnly) {
            openPicker('replace', {
              lineNumber: endPos.lineNumber,
              column: endPos.column,
            }, clickedPlaceholder);
          }
        } else {
          closePicker();
        }
      }
    });

    // Keyboard handler - atomic placeholder deletion
    const keyDisposable = editor.onKeyDown((e: any) => {
      // Escape closes picker
      if (e.keyCode === monaco.KeyCode.Escape && pickerState.isOpen) {
        e.preventDefault();
        e.stopPropagation();
        closePicker();
        return;
      }

      if (e.keyCode !== monaco.KeyCode.Backspace && e.keyCode !== monaco.KeyCode.Delete) {
        return;
      }

      const model = editor.getModel();
      if (!model) return;

      const selection = editor.getSelection();
      if (!selection) return;

      const currentCode = model.getValue();
      const placeholders = findPlaceholders(currentCode);

      if (selection.isEmpty()) {
        const cursorOffset = model.getOffsetAt(selection.getStartPosition());

        if (e.keyCode === monaco.KeyCode.Backspace) {
          const adjacentPlaceholder = placeholders.find(
            p => cursorOffset > p.startOffset && cursorOffset <= p.endOffset
          );

          if (adjacentPlaceholder) {
            e.preventDefault();
            e.stopPropagation();

            // Delete the placeholder atomically
            const startPos = model.getPositionAt(adjacentPlaceholder.startOffset);
            const endPos = model.getPositionAt(adjacentPlaceholder.endOffset);
            editor.executeEdits('delete-placeholder', [{
              range: new monaco.Range(
                startPos.lineNumber, startPos.column,
                endPos.lineNumber, endPos.column
              ),
              text: '',
              forceMoveMarkers: true,
            }]);
            setSelectedPlaceholder(null);
            closePicker();
          }
        }

        if (e.keyCode === monaco.KeyCode.Delete) {
          const adjacentPlaceholder = placeholders.find(
            p => cursorOffset >= p.startOffset && cursorOffset < p.endOffset
          );

          if (adjacentPlaceholder) {
            e.preventDefault();
            e.stopPropagation();

            const startPos = model.getPositionAt(adjacentPlaceholder.startOffset);
            const endPos = model.getPositionAt(adjacentPlaceholder.endOffset);
            editor.executeEdits('delete-placeholder', [{
              range: new monaco.Range(
                startPos.lineNumber, startPos.column,
                endPos.lineNumber, endPos.column
              ),
              text: '',
              forceMoveMarkers: true,
            }]);
            setSelectedPlaceholder(null);
            closePicker();
          }
        }
      } else {
        // Selection overlapping placeholder - extend to include full placeholder
        const selStart = model.getOffsetAt(selection.getStartPosition());
        const selEnd = model.getOffsetAt(selection.getEndPosition());

        for (const placeholder of placeholders) {
          const overlaps = (selStart < placeholder.endOffset && selEnd > placeholder.startOffset);
          const fullyContains = (selStart <= placeholder.startOffset && selEnd >= placeholder.endOffset);

          if (overlaps && !fullyContains) {
            e.preventDefault();
            e.stopPropagation();

            const newStart = Math.min(selStart, placeholder.startOffset);
            const newEnd = Math.max(selEnd, placeholder.endOffset);
            const startPos = model.getPositionAt(newStart);
            const endPos = model.getPositionAt(newEnd);
            editor.setSelection(new monaco.Range(
              startPos.lineNumber, startPos.column,
              endPos.lineNumber, endPos.column
            ));
            return;
          }
        }
      }
    });

    // '@' trigger handler - open picker for insertion
    const typeDisposable = editor.onDidType((text: string) => {
      if (text === '@' && !readOnly) {
        const selection = editor.getSelection();
        if (!selection) return;

        const pos = selection.getPosition();
        openPicker('insert', {
          lineNumber: pos.lineNumber,
          column: pos.column,
        });
      }
    });

    return () => {
      clickDisposable.dispose();
      keyDisposable.dispose();
      typeDisposable.dispose();
    };
  }, [readOnly, openPicker, closePicker, pickerState.isOpen]);

  // Re-register listeners when dependencies change
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    return setupEditorListeners(editor, monaco);
  }, [setupEditorListeners]);

  const onEditorMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Initial decoration update
    setTimeout(() => updateDecorations(), 50);
  }, [updateDecorations]);

  return {
    onEditorMount,
    pickerState,
    closePicker,
    selectedPlaceholder,
    insertPlaceholder,
    pickerContainerRef,
    dataSources,
  };
}
