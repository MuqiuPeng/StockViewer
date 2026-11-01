/**
 * Utility functions for making HTTP requests with retry and timeout support
 */

/**
 * Fetch with timeout and automatic retry on failure
 *
 * @param url - The URL to fetch
 * @param options - Configuration options
 * @param options.timeout - Request timeout in milliseconds (default: 30000)
 * @param options.retries - Number of retry attempts (default: 2)
 * @returns The fetch Response object
 * @throws Error if all retry attempts fail
 */
export async function fetchWithRetry(
  url: string,
  options: { timeout?: number; retries?: number } = {}
): Promise<Response> {
  const { timeout = 30000, retries = 2 } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Log retry attempts
      if (attempt < retries) {
        console.warn(`Fetch attempt ${attempt + 1} failed for ${url}: ${lastError.message}. Retrying...`);
        // Wait before retry (exponential backoff: 1s, 2s, 3s...)
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      } else {
        console.error(`All fetch attempts failed for ${url}: ${lastError.message}`);
      }
    }
  }

  throw lastError || new Error('Fetch failed after all retries');
}

/**
 * Fetch JSON data with timeout and retry
 *
 * @param url - The URL to fetch
 * @param options - Configuration options
 * @returns The parsed JSON data
 * @throws Error if fetch fails or response is not valid JSON
 */
export async function fetchJsonWithRetry<T = unknown>(
  url: string,
  options: { timeout?: number; retries?: number } = {}
): Promise<{ data: T; ok: boolean; status: number }> {
  const response = await fetchWithRetry(url, options);

  try {
    const data = await response.json();
    return {
      data,
      ok: response.ok,
      status: response.status,
    };
  } catch {
    throw new Error(`Failed to parse JSON response from ${url}`);
  }
}
