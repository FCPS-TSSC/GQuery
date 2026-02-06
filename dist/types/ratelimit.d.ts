/**
 * Exponential backoff handler for Google Sheets API calls
 * Handles rate limiting (429) and quota exceeded errors
 * @param fn Function to execute with retry logic
 * @param retries Maximum number of retry attempts (default: 16)
 * @returns Result of the function execution
 */
export declare function callHandler<T>(fn: () => T, retries?: number): T;
