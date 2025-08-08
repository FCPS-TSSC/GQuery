"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateInternal = updateInternal;
var ratelimit_1 = require("./ratelimit");
function updateInternal(gQueryTableFactory, updateFn) {
    // Get table configuration
    var spreadsheetId = gQueryTableFactory.gQueryTable.spreadsheetId;
    var sheetName = gQueryTableFactory.gQueryTable.sheetName;
    var range = sheetName;
    // Fetch current data from the sheet
    var response = (0, ratelimit_1.callHandler)(function () {
        return Sheets.Spreadsheets.Values.get(spreadsheetId, range);
    });
    var values = response.values || [];
    if (values.length === 0) {
        return { rows: [], headers: [] };
    }
    // Extract headers and rows
    var headers = values[0];
    var rows = values.slice(1).map(function (row) {
        var obj = {};
        headers.forEach(function (header, i) {
            // Ensure all properties are initialized, even if empty
            obj[header] = row[i] !== undefined ? row[i] : "";
        });
        return obj;
    });
    // Filter rows if where function is provided
    var filteredRows = [];
    if (gQueryTableFactory.filterOption) {
        try {
            filteredRows = rows.filter(function (row) {
                try {
                    return gQueryTableFactory.filterOption(row);
                }
                catch (error) {
                    console.error("Error filtering row:", error);
                    return false;
                }
            });
        }
        catch (error) {
            console.error("Error in filter function:", error);
            return { rows: [], headers: headers };
        }
    }
    else {
        filteredRows = rows;
    }
    // Update filtered rows
    var updatedRows = filteredRows.map(function (row) {
        // Apply the update function to get the updated row values
        var updatedRow = __assign({}, row);
        try {
            var result = updateFn(updatedRow);
            // Handle both return value updates and direct modifications
            Object.assign(updatedRow, result);
        }
        catch (error) {
            console.error("Error updating row:", error);
        }
        // Find the index of this row in the original data array
        var rowIndex = rows.findIndex(function (origRow) {
            return Object.keys(origRow).every(function (key) { return origRow[key] === row[key]; });
        });
        // Add __meta to each row with required properties
        if (rowIndex !== -1) {
            updatedRow.__meta = {
                rowNum: rowIndex + 2, // +2 because we have headers at index 0 and row index is 0-based
                colLength: headers.length,
            };
        }
        return updatedRow;
    });
    // Track changes to optimize updates
    var changedCells = new Map();
    // For each updated row, determine which cells changed
    updatedRows.forEach(function (updatedRow) {
        if (!updatedRow.__meta)
            return;
        var rowIndex = updatedRow.__meta.rowNum - 2;
        var originalRow = rows[rowIndex];
        headers.forEach(function (header, columnIndex) {
            var updatedValue = updatedRow[header];
            // Convert Date objects to strings for comparison and storage
            if (updatedValue instanceof Date) {
                updatedValue = updatedValue.toLocaleString();
            }
            // Skip if values are the same
            if (originalRow[header] === updatedValue)
                return;
            // Only update if we have a meaningful value or if the original was empty
            // This prevents overwriting existing data with empty values
            if (updatedValue !== undefined &&
                updatedValue !== null &&
                updatedValue !== "") {
                // Use A1 notation for the column (A, B, C, etc.)
                var columnLetter = getColumnLetter(columnIndex);
                var cellRange = "".concat(sheetName, "!").concat(columnLetter).concat(updatedRow.__meta.rowNum);
                // Store the change
                changedCells.set(cellRange, [[updatedValue]]);
            }
            else if (originalRow[header] === "" ||
                originalRow[header] === undefined ||
                originalRow[header] === null) {
                // Only clear the cell if the original was already empty and we explicitly want to set it to empty
                var columnLetter = getColumnLetter(columnIndex);
                var cellRange = "".concat(sheetName, "!").concat(columnLetter).concat(updatedRow.__meta.rowNum);
                changedCells.set(cellRange, [[updatedValue || ""]]);
            }
            // If updatedValue is empty but original had content, we skip the update to preserve existing data
        });
    });
    // Only update if we have changes
    if (changedCells.size > 0) {
        // Group adjacent cells in the same column for more efficient updates
        var optimizedUpdates = optimizeRanges(changedCells);
        // Create a batch update request
        var batchUpdateRequest_1 = {
            data: [],
            valueInputOption: "USER_ENTERED",
        };
        // Add each range to the batch request
        for (var _i = 0, _a = Object.entries(optimizedUpdates); _i < _a.length; _i++) {
            var _b = _a[_i], range_1 = _b[0], values_1 = _b[1];
            batchUpdateRequest_1.data.push({
                range: range_1,
                values: values_1,
            });
        }
        // Send a single batch update to Google Sheets
        (0, ratelimit_1.callHandler)(function () {
            return Sheets.Spreadsheets.Values.batchUpdate(batchUpdateRequest_1, spreadsheetId);
        });
    }
    // If updates were made, properly return the filtered and updated rows
    // Make a fresh copy of the returned rows to ensure they have proper structure
    var resultRows = filteredRows.length > 0
        ? updatedRows.map(function (row) {
            var resultRow = { __meta: row.__meta };
            headers.forEach(function (header) {
                resultRow[header] = row[header];
            });
            return resultRow;
        })
        : [];
    // Return the updated rows
    return {
        rows: resultRows,
        headers: headers,
    };
}
/**
 * Convert column index to column letter (0 -> A, 1 -> B, etc.)
 */
function getColumnLetter(columnIndex) {
    var columnLetter = "";
    var index = columnIndex;
    while (index >= 0) {
        columnLetter = String.fromCharCode(65 + (index % 26)) + columnLetter;
        index = Math.floor(index / 26) - 1;
    }
    return columnLetter;
}
/**
 * Optimize update ranges by combining adjacent cells in the same column
 */
function optimizeRanges(changedCells) {
    // Group cells by column
    var columnGroups = new Map();
    for (var _i = 0, _a = changedCells.entries(); _i < _a.length; _i++) {
        var _b = _a[_i], cellRange = _b[0], value = _b[1];
        // Extract column letter and row number from A1 notation
        var matches = cellRange.match(/([^!]+)!([A-Z]+)(\d+)$/);
        if (!matches)
            continue;
        var sheet = matches[1];
        var columnLetter = matches[2];
        var rowNumber = parseInt(matches[3]);
        var columnKey = "".concat(sheet, "!").concat(columnLetter);
        if (!columnGroups.has(columnKey)) {
            columnGroups.set(columnKey, new Map());
        }
        columnGroups.get(columnKey).set(rowNumber, value[0][0]);
    }
    // Create optimized ranges
    var optimizedUpdates = {};
    for (var _c = 0, _d = columnGroups.entries(); _c < _d.length; _c++) {
        var _e = _d[_c], columnKey = _e[0], rowsMap = _e[1];
        // Sort row numbers
        var rowNumbers = Array.from(rowsMap.keys()).sort(function (a, b) { return a - b; });
        if (rowNumbers.length === 0)
            continue;
        // Find min and max to create one range per column
        var minRow = Math.min.apply(Math, rowNumbers);
        var maxRow = Math.max.apply(Math, rowNumbers);
        // Extract sheet name and column from columnKey
        var sheet = columnKey.split("!")[0];
        var column = columnKey.split("!")[1];
        // Create a single range from min to max row
        var rangeKey = "".concat(sheet, "!").concat(column).concat(minRow, ":").concat(column).concat(maxRow);
        // Create array of values with proper ordering
        var values = [];
        for (var row = minRow; row <= maxRow; row++) {
            // Use the updated value if it exists, otherwise use empty string to preserve the existing value
            var value = rowsMap.has(row) ? rowsMap.get(row) : "";
            // Convert Date objects to strings
            if (value instanceof Date) {
                value = value.toLocaleString();
            }
            values.push([value]);
        }
        optimizedUpdates[rangeKey] = values;
    }
    return optimizedUpdates;
}
