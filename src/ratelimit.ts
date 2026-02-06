/**
 * Exponential backoff handler for Google Sheets API calls
 * Handles rate limiting (429) and quota exceeded errors
 * @param fn Function to execute with retry logic
 * @param retries Maximum number of retry attempts (default: 16)
 * @returns Result of the function execution
 */
export function callHandler<T>(fn: () => T, retries: number = 16): T {
  let attempt = 0;

  while (attempt < retries) {
    try {
      return fn();
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      
      // Check if it's a rate limit or quota error
      const isRateLimitError = 
        errorMessage.includes("429") ||
        errorMessage.includes("Quota exceeded") ||
        errorMessage.includes("Rate Limit Exceeded");
      
      if (isRateLimitError) {
        attempt++;
        
        if (attempt >= retries) {
          throw new Error(
            `Max retries (${retries}) reached for Google Sheets API call. Last error: ${errorMessage}`
          );
        }
        
        // Exponential backoff with jitter, capped at 64 seconds
        const backoffDelay = Math.min(
          Math.pow(2, attempt) * 1000 + Math.random() * 1000,
          64000
        );
        
        console.log(`Rate limit hit, retrying in ${Math.round(backoffDelay)}ms (attempt ${attempt}/${retries})`);
        Utilities.sleep(backoffDelay);
      } else {
        // Not a rate limit error, rethrow immediately
        throw error;
      }
    }
  }

  throw new Error("Unexpected state: Max retries reached without throwing error");
}
