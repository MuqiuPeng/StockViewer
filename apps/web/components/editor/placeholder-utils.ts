export const BASE_COLUMNS = ['open', 'high', 'low', 'close', 'volume'];

/**
 * Transform ${...} markers to actual Python code (before save/validate).
 *
 * Formats:
 * - `${close}` -> `data['close']`
 * - `${IND:name}` -> `data.import_('name')['value']`
 * - `${IND:name:column}` -> `data.import_('name')['column']`
 * - `${DS:symbol@column}` -> `data.import_('symbol', type='dataset')['column']`
 */
export const transformPlaceholdersToCode = (code: string): string => {
  let result = code;

  // Transform base column markers: ${close} -> data['close']
  for (const col of BASE_COLUMNS) {
    result = result.replace(new RegExp(`\\$\\{${col}\\}`, 'g'), `data['${col}']`);
  }

  // Transform dataset column markers: ${DS:symbol@column} -> data.import_(...)
  result = result.replace(/\$\{DS:([^@}]+)@([^}]+)\}/g, (_, symbol, column) => {
    return `data.import_('${symbol}', type='dataset')['${column}']`;
  });

  // Transform group indicator column markers: ${IND:name:column} -> data.import_(...)
  result = result.replace(/\$\{IND:([^:}]+):([^}]+)\}/g, (_, name, column) => {
    return `data.import_('${name}')['${column}']`;
  });

  // Transform single indicator markers: ${IND:name} -> data.import_(...)
  result = result.replace(/\$\{IND:([^}]+)\}/g, (_, name) => {
    return `data.import_('${name}')['value']`;
  });

  return result;
};

/**
 * Transform Python code to ${...} markers (when loading for editing).
 */
export const transformCodeToPlaceholders = (code: string): string => {
  let result = code;

  // Transform base column access: data['close'] -> ${close}
  for (const col of BASE_COLUMNS) {
    result = result.replace(new RegExp(`data\\['${col}'\\]`, 'g'), `\${${col}}`);
    result = result.replace(new RegExp(`data\\["${col}"\\]`, 'g'), `\${${col}}`);
  }

  // Transform dataset imports
  result = result.replace(
    /data\.import_\(\s*['"]([^'"]+)['"]\s*,\s*type\s*=\s*['"]dataset['"]\s*\)\s*\['([^']+)'\]/g,
    (_, symbol, column) => `\${DS:${symbol}@${column}}`
  );

  // Handle user-specific imports
  result = result.replace(
    /data\.import_\(\s*user\s*=\s*['"][^'"]+['"]\s*,\s*indicator\s*=\s*['"]([^'"]+)['"]\s*\)\s*\['([^']+)'\]/g,
    (_, name, column) => column === 'value' ? `\${IND:${name}}` : `\${IND:${name}:${column}}`
  );

  // Match indicator imports with column access
  result = result.replace(
    /data\.import_\(\s*['"]([^'"]+)['"]\s*\)\s*\['([^']+)'\]/g,
    (_, name, column) => column === 'value' ? `\${IND:${name}}` : `\${IND:${name}:${column}}`
  );

  // Match imports without column access (backward compatibility)
  result = result.replace(
    /data\.import_\(\s*['"]([^'"]+)['"]\s*\)/g,
    (_, name) => `\${IND:${name}}`
  );

  return result;
};

/**
 * Build a ${...} marker text for a given selection.
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
      return `\${${opts.column}}`;
    case 'indicator':
      if (opts.isGroupColumn && opts.columnName) {
        return `\${IND:${opts.indicatorName}:${opts.columnName}}`;
      }
      return `\${IND:${opts.indicatorName}}`;
    case 'dataset':
      return `\${DS:${opts.datasetSymbol}@${opts.datasetColumn}}`;
    default:
      return '';
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
