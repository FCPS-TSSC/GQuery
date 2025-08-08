"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendInternal = appendInternal;
var ratelimit_1 = require("./ratelimit");
function appendInternal(table, data) {
    // If no data is provided or empty array, return empty result
    if (!data || data.length === 0) {
        return { rows: [], headers: [] };
    }
    // Extract spreadsheet information
    var spreadsheetId = table.spreadsheetId;
    var sheetName = table.sheetName;
    // First, get the current headers from the sheet
    var response = (0, ratelimit_1.callHandler)(function () {
        return Sheets.Spreadsheets.Values.get(spreadsheetId, "".concat(sheetName, "!1:1"));
    });
    // If sheet is empty or doesn't exist, cannot append
    if (!response || !response.values || response.values.length === 0) {
        throw new Error("Sheet \"".concat(sheetName, "\" not found or has no headers"));
    }
    var headers = response.values[0].map(function (header) { return String(header); });
    // Format data to be appended according to the sheet's headers
    var rowsToAppend = data.map(function (item) {
        // For each header, get corresponding value from item or empty string
        return headers.map(function (header) {
            var value = item[header];
            // Convert Date objects to strings
            if (value instanceof Date) {
                value = value.toLocaleString();
            }
            return value !== undefined ? value : "";
        });
    });
    // Use Sheets API to append the data
    var appendResponse = (0, ratelimit_1.callHandler)(function () {
        return Sheets.Spreadsheets.Values.append({ values: rowsToAppend }, spreadsheetId, "".concat(sheetName), {
            valueInputOption: "USER_ENTERED",
            insertDataOption: "OVERWRITE",
            responseValueRenderOption: "FORMATTED_VALUE",
            responseDateTimeRenderOption: "FORMATTED_STRING",
            includeValuesInResponse: true,
        });
    });
    // Check if append was successful
    if (!appendResponse ||
        !appendResponse.updates ||
        !appendResponse.updates.updatedRange) {
        throw new Error("Failed to append data to sheet");
    }
    // Extract information about the appended rows
    var updatedRange = appendResponse.updates.updatedRange;
    var rangeMatch = updatedRange.match(/([^!]+)!([A-Z]+)(\d+):([A-Z]+)(\d+)/);
    if (!rangeMatch) {
        throw new Error("Could not parse updated range: ".concat(updatedRange));
    }
    // Get start and end row numbers from the updated range
    var startRow = parseInt(rangeMatch[3]);
    var endRow = parseInt(rangeMatch[5]);
    // Create result rows with metadata
    var resultRows = rowsToAppend.map(function (row, index) {
        var rowObj = {
            __meta: {
                rowNum: startRow + index,
                colLength: headers.length,
            },
        };
        // Add data according to headers
        headers.forEach(function (header, colIndex) {
            rowObj[header] = row[colIndex];
        });
        return rowObj;
    });
    return {
        rows: resultRows,
        headers: headers,
    };
}
