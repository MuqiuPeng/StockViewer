export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validatePythonCode(code: string): ValidationResult {
  // Must contain 'def calculate'
  if (!code.includes('def calculate')) {
    return {
      valid: false,
      error: 'Code must define a calculate(data) function',
    };
  }

  // Block dangerous imports/functions
  const dangerousPatterns = [
    { pattern: /import\s+os\b/, name: 'os module' },
    { pattern: /import\s+subprocess\b/, name: 'subprocess module' },
    { pattern: /import\s+sys\b/, name: 'sys module' },
    { pattern: /from\s+os\b/, name: 'os module' },
    { pattern: /from\s+subprocess\b/, name: 'subprocess module' },
    { pattern: /__import__/, name: '__import__' },
    { pattern: /\beval\s*\(/, name: 'eval()' },
    { pattern: /\bexec\s*\(/, name: 'exec()' },
    { pattern: /\bopen\s*\(/, name: 'open()' },
    { pattern: /\b__builtins__\b/, name: '__builtins__' },
    { pattern: /\b__globals__\b/, name: '__globals__' },
  ];

  for (const { pattern, name } of dangerousPatterns) {
    if (pattern.test(code)) {
      return {
        valid: false,
        error: `Dangerous pattern not allowed: ${name}`,
      };
    }
  }

  return { valid: true };
}
