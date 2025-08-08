"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callHandler = callHandler;
function callHandler(fn, retries) {
    if (retries === void 0) { retries = 16; }
    var attempt = 0;
    while (attempt < retries) {
        try {
            return fn();
        }
        catch (error) {
            if (error.message.includes("429") ||
                error.message.includes("Quota exceeded for quota metric")) {
                attempt++;
                var backoffDelay = Math.min(Math.pow(2, attempt) + Math.random() * 1000, 64000);
                Utilities.sleep(backoffDelay);
            }
            else {
                throw error; // Rethrow if it's not a rate limit error
            }
        }
    }
    throw new Error("Max retries reached for Google Sheets API call.");
}
