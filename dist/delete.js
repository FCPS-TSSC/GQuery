"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteInternal = deleteInternal;
var ratelimit_1 = require("./ratelimit");
function deleteInternal(gqueryTableFactory) {
    // Get table configuration
    var spreadsheetId = gqueryTableFactory.gQueryTable.spreadsheetId;
    var sheetName = gqueryTableFactory.gQueryTable.sheetName;
    var sheet = gqueryTableFactory.gQueryTable.sheet;
    var sheetId = sheet.getSheetId();
    // Fetch current data from the sheet
    var response = (0, ratelimit_1.callHandler)(function () {
        return Sheets.Spreadsheets.Values.get(spreadsheetId, sheetName);
    });
    var values = response.values || [];
    if (values.length <= 1) {
        // Only header row or empty sheet
        return { deletedRows: 0 };
    }
    // Extract headers and rows
    var headers = values[0];
    var rows = values.slice(1).map(function (row, rowIndex) {
        var obj = {
            __meta: {
                rowNum: rowIndex + 2, // +2 because we're starting from index 0 and row 1 is headers
                colLength: row.length,
            },
        };
        headers.forEach(function (header, i) {
            obj[header] = i < row.length ? row[i] : "";
        });
        return obj;
    });
    // If no filter option, nothing to delete
    if (!gqueryTableFactory.filterOption || rows.length === 0) {
        return { deletedRows: 0 };
    }
    // Find rows matching the filter condition (these will be deleted)
    var rowsToDelete = rows.filter(function (row) {
        try {
            return gqueryTableFactory.filterOption(row);
        }
        catch (error) {
            console.error("Error filtering row:", error);
            return false;
        }
    });
    if (rowsToDelete.length === 0) {
        return { deletedRows: 0 };
    }
    // Sort rowsToDelete by row number in descending order to avoid shifting issues
    rowsToDelete.sort(function (a, b) { return b.__meta.rowNum - a.__meta.rowNum; });
    // Create an array of row indices to delete
    var rowIndicesToDelete = rowsToDelete.map(function (row) { return row.__meta.rowNum; });
    // Create batch update request for deleting the rows
    var batchUpdateRequest = {
        requests: rowIndicesToDelete.map(function (rowIndex) { return ({
            deleteDimension: {
                range: {
                    sheetId: sheetId,
                    dimension: "ROWS",
                    startIndex: rowIndex - 1, // Convert to 0-based index
                    endIndex: rowIndex, // Range is end-exclusive
                },
            },
        }); }),
    };
    // Execute the batch update
    try {
        (0, ratelimit_1.callHandler)(function () {
            return Sheets.Spreadsheets.batchUpdate(batchUpdateRequest, spreadsheetId);
        });
    }
    catch (error) {
        console.error("Error deleting rows:", error);
        return { deletedRows: 0 };
    }
    return { deletedRows: rowsToDelete.length };
}
