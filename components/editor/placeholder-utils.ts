import type { PlaceholderInfo } from './types';

export const BASE_COLUMNS = ['open', 'high', 'low', 'close', 'volume'];

/**
 * Transform visual placeholders to actual Python code (before save/validate).
 *
 * Formats:
 * - `◈close◈` -> `data['close']`
 * - `◈IND:name◈` -> `data.import_('name')['value']`
 * - `◈IND:name:column◈` -> `data.import_('name')['column']`
 * - `◈DS:symbol@column◈` -> `data.import_('symbol', type='dataset')['column']`
 */
export const transformPlaceholdersToCode = (code: string): string => {
  let result = code;

  // Transform base column placeholders: ◈close◈ -> data['close']
  for (const col of BASE_COLUMNS) {
    result = result.replace(new RegExp(`◈${col}◈`, 'g'), `data['${col}']`);
  }

  // Transform dataset column placeholders: ◈DS:symbol@column◈ -> data.import_(...)
  result = result.replace(/◈DS:([^@◈]+)@([^◈]+)◈/g, (_, symbol, column) => {
    return `data.import_('${symbol}', type='dataset')['${column}']`;
  });

  // Transform group indicator column placeholders: ◈IND:name:column◈ -> data.import_(...)
  result = result.replace(/◈IND:([^:◈]+):([^◈]+)◈/g, (_, name, column) => {
    return `data.import_('${name}')['${column}']`;
  });

  // Transform single indicator placeholders: ◈IND:name◈ -> data.import_(...)
  result = result.replace(/◈IND:([^◈]+)◈/g, (_, name) => {
    return `data.import_('${name}')['value']`;
  });

  return result;
};

/**
 * Transform Python code to visual placeholders (when loading for editing).
 */
export const transformCodeToPlaceholders = (code: string): string => {
  let result = code;

  // Transform base column access: data['close'] -> ◈close◈
  for (const col of BASE_COLUMNS) {
    result = result.replace(new RegExp(`data\\['${col}'\\]`, 'g'), `◈${col}◈`);
    result = result.replace(new RegExp(`data\\["${col}"\\]`, 'g'), `◈${col}◈`);
  }

  // Transform dataset imports
  result = result.replace(
    /data\.import_\(\s*['"]([^'"]+)['"]\s*,\s*type\s*=\s*['"]dataset['"]\s*\)\s*\['([^']+)'\]/g,
    (_, symbol, column) => `◈DS:${symbol}@${column}◈`
  );

  // Handle user-specific imports
  result = result.replace(
    /data\.import_\(\s*user\s*=\s*['"][^'"]+['"]\s*,\s*indicator\s*=\s*['"]([^'"]+)['"]\s*\)\s*\['([^']+)'\]/g,
    (_, name, column) => column === 'value' ? `◈IND:${name}◈` : `◈IND:${name}:${column}◈`
  );

  // Match indicator imports with column access
  result = result.replace(
    /data\.import_\(\s*['"]([^'"]+)['"]\s*\)\s*\['([^']+)'\]/g,
    (_, name, column) => column === 'value' ? `◈IND:${name}◈` : `◈IND:${name}:${column}◈`
  );

  // Match imports without column access (backward compatibility)
  result = result.replace(
    /data\.import_\(\s*['"]([^'"]+)['"]\s*\)/g,
    (_, name) => `◈IND:${name}◈`
  );

  return result;
};

/**
 * Find all visual placeholders in code and return their positions.
 */
export const findPlaceholders = (code: string): PlaceholderInfo[] => {
  const placeholders: PlaceholderInfo[] = [];
  const lines = code.split('\n');
  let offset = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    // Find base column placeholders ◈close◈ (not ◈IND:...◈ or ◈DS:...◈)
    for (const col of BASE_COLUMNS) {
      const colRegex = new RegExp(`◈${col}◈`, 'g');
      let match;
      while ((match = colRegex.exec(line)) !== null) {
        placeholders.push({
          type: 'base',
          id: col,
          displayName: col,
          startOffset: offset + match.index,
          endOffset: offset + match.index + match[0].length,
          lineNumber: lineIdx + 1,
          column: match.index + 1,
          length: match[0].length,
        });
      }
    }

    // Find indicator placeholders ◈IND:name◈ or ◈IND:name:column◈
    const indRegex = /◈IND:([^◈]+)◈/g;
    let indMatch;
    while ((indMatch = indRegex.exec(line)) !== null) {
      placeholders.push({
        type: 'indicator',
        id: '',
        displayName: indMatch[1],
        startOffset: offset + indMatch.index,
        endOffset: offset + indMatch.index + indMatch[0].length,
        lineNumber: lineIdx + 1,
        column: indMatch.index + 1,
        length: indMatch[0].length,
      });
    }

    // Find dataset placeholders ◈DS:symbol@column◈
    const dsRegex = /◈DS:([^@◈]+)@([^◈]+)◈/g;
    let dsMatch;
    while ((dsMatch = dsRegex.exec(line)) !== null) {
      placeholders.push({
        type: 'dataset',
        id: dsMatch[1],
        displayName: `${dsMatch[1]}@${dsMatch[2]}`,
        startOffset: offset + dsMatch.index,
        endOffset: offset + dsMatch.index + dsMatch[0].length,
        lineNumber: lineIdx + 1,
        column: dsMatch.index + 1,
        length: dsMatch[0].length,
      });
    }

    offset += line.length + 1; // +1 for newline
  }

  return placeholders;
};

/**
 * Build the placeholder text for a given picker selection.
 */
export const buildPlaceholderText = (
  type: 'base' | 'indicator' | 'dataset',
  opts: {
    column?: string;
    indicatorName?: string;
    columnName?: string;
    isGroupColumn?: boolean;
    datasetSymbol?: string;
    datasetColumn?: string;
  }
): string => {
  switch (type) {
    case 'base':
      return `◈${opts.column}◈`;
    case 'indicator':
      if (opts.isGroupColumn && opts.columnName) {
        return `◈IND:${opts.indicatorName}:${opts.columnName}◈`;
      }
      return `◈IND:${opts.indicatorName}◈`;
    case 'dataset':
      return `◈DS:${opts.datasetSymbol}@${opts.datasetColumn}◈`;
    default:
      return '';
  }
};

/**
 * Get a human-readable chip label for a placeholder.
 */
export const getChipLabel = (placeholder: PlaceholderInfo): string => {
  switch (placeholder.type) {
    case 'base':
      return placeholder.displayName;
    case 'indicator':
      return placeholder.displayName;
    case 'dataset':
      return placeholder.displayName;
    default:
      return placeholder.displayName;
  }
};

/**
 * Wrap user code body with `def calculate(data):`.
 */
export const wrapCodeBody = (body: string): string => {
  const lines = body.split('\n');
  const indentedLines = lines.map(line => line ? '    ' + line : '');
  return `def calculate(data):\n${indentedLines.join('\n')}`;
};

/**
 * Extract body from full function code.
 */
export const extractCodeBody = (fullCode: string): string => {
  const lines = fullCode.split('\n');

  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('def calculate(data)')) {
      startIdx = i + 1;
      break;
    }
  }

  if (startIdx === -1) {
    return fullCode;
  }

  // Skip docstring if present
  let bodyStart = startIdx;
  const firstBodyLine = lines[bodyStart]?.trim();
  if (firstBodyLine?.startsWith('"""') || firstBodyLine?.startsWith("'''")) {
    const quote = firstBodyLine.startsWith('"""') ? '"""' : "'''";
    if (firstBodyLine.slice(3).includes(quote)) {
      bodyStart++;
    } else {
      for (let i = bodyStart + 1; i < lines.length; i++) {
        if (lines[i].includes(quote)) {
          bodyStart = i + 1;
          break;
        }
      }
    }
  }

  const bodyLines = lines.slice(bodyStart);
  const dedentedLines = bodyLines.map(line => {
    if (line.startsWith('    ')) return line.slice(4);
    if (line.startsWith('\t')) return line.slice(1);
    return line;
  });

  return dedentedLines.join('\n').trim();
};
