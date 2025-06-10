export function callHandler<T>(fn: () => T, retries: number = 10): T {
  let attempt = 0;

  while (attempt < retries) {
    try {
      return fn();
    } catch (error) {
      if (error.message.includes("429")) {
        attempt++;
        const backoffDelay = Math.min(
          Math.pow(2, attempt) + Math.random() * 1000,
          32000
        );
        Utilities.sleep(backoffDelay);
      } else {
        throw error; // Rethrow if it's not a rate limit error
      }
    }
  }

  throw new Error("Max retries reached for Google Sheets API call.");
}
