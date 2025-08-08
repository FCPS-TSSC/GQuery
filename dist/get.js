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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getManyInternal = getManyInternal;
exports.getInternal = getInternal;
exports.queryInternal = queryInternal;
var ratelimit_1 = require("./ratelimit");
var types_1 = require("./types");
function getManyInternal(gquery, sheetNames, options) {
    if (!sheetNames || sheetNames.length === 0) {
        return {};
    }
    // Set default options if not provided
    var valueRenderOption = (options === null || options === void 0 ? void 0 : options.valueRenderOption) || types_1.ValueRenderOption.FORMATTED_VALUE;
    var dateTimeRenderOption = (options === null || options === void 0 ? void 0 : options.dateTimeRenderOption) || types_1.DateTimeRenderOption.FORMATTED_STRING;
    var result = {};
    var headersMap = {};
    var _loop_1 = function (sheetName) {
        try {
            var headerResponse = (0, ratelimit_1.callHandler)(function () {
                return Sheets.Spreadsheets.Values.get(gquery.spreadsheetId, "".concat(sheetName, "!1:1"), {
                    valueRenderOption: valueRenderOption,
                    dateTimeRenderOption: dateTimeRenderOption,
                });
            });
            if (!headerResponse ||
                !headerResponse.values ||
                headerResponse.values.length === 0) {
                // Handle empty sheet or sheet with no headers
                result[sheetName] = { headers: [], rows: [] };
                return "continue";
            }
            headersMap[sheetName] = headerResponse.values[0].map(function (header) {
                return String(header);
            });
        }
        catch (e) {
            console.error("Error fetching headers for sheet ".concat(sheetName, ":"), e);
            result[sheetName] = { headers: [], rows: [] };
        }
    };
    // Step 1: Get headers for each sheet (row 1)
    for (var _i = 0, sheetNames_1 = sheetNames; _i < sheetNames_1.length; _i++) {
        var sheetName = sheetNames_1[_i];
        _loop_1(sheetName);
    }
    // Step 2: Get data for sheets that have headers
    var sheetsToFetch = Object.keys(headersMap).filter(function (sheet) { return headersMap[sheet].length > 0; });
    if (sheetsToFetch.length === 0) {
        return result;
    }
    // Also fetch metadata for each sheet to determine data types
    var sheetMetadata = {};
    try {
        // Get spreadsheet metadata including sheet tables if available
        var metadataResponse = (0, ratelimit_1.callHandler)(function () {
            return Sheets.Spreadsheets.get(gquery.spreadsheetId, {
                fields: "sheets(properties(title),tables.columnProperties)",
            });
        });
        if (metadataResponse && metadataResponse.sheets) {
            metadataResponse.sheets.forEach(function (sheet) {
                var _a;
                var sheetName = (_a = sheet.properties) === null || _a === void 0 ? void 0 : _a.title;
                if (!sheetName || !sheetsToFetch.includes(sheetName))
                    return;
                // @ts-expect-error: TypeScript may not recognize the tables property
                if (sheet.tables && sheet.tables.length > 0) {
                    // Use the first table definition for column properties
                    // @ts-expect-error: TypeScript may not recognize the tables property
                    var table_1 = sheet.tables[0];
                    if (table_1.columnProperties) {
                        sheetMetadata[sheetName] = {};
                        // For each column property, store its data type
                        Object.keys(table_1.columnProperties).forEach(function (column) {
                            var dataType = table_1.columnProperties[column].dataType;
                            if (dataType) {
                                sheetMetadata[sheetName][column] = dataType;
                            }
                        });
                    }
                }
            });
        }
    }
    catch (e) {
        console.error("Error fetching metadata:", e);
        // Continue without metadata - types won't be converted
    }
    // Batch get data for all sheets (just use the sheet name as the range)
    var dataRanges = sheetsToFetch.map(function (sheet) { return "".concat(sheet); });
    var dataResponse = (0, ratelimit_1.callHandler)(function () {
        return Sheets.Spreadsheets.Values.batchGet(gquery.spreadsheetId, {
            ranges: dataRanges,
            valueRenderOption: valueRenderOption,
            dateTimeRenderOption: dateTimeRenderOption,
        });
    });
    if (!dataResponse || !dataResponse.valueRanges) {
        // Return just the headers if we couldn't get any data
        sheetsToFetch.forEach(function (sheet) {
            result[sheet] = {
                headers: headersMap[sheet],
                rows: [],
            };
        });
        return result;
    }
    // Process each value range from the batch response
    dataResponse.valueRanges.forEach(function (valueRange, index) {
        var sheetName = sheetsToFetch[index];
        var headers = headersMap[sheetName];
        if (!valueRange.values || valueRange.values.length === 0) {
            // Sheet exists but has no data rows
            result[sheetName] = { headers: headers, rows: [] };
            return;
        }
        var rows = [];
        var columnTypes = sheetMetadata[sheetName] || {};
        // Process data rows
        valueRange.values.forEach(function (rowData, rowIndex) {
            var row = {
                __meta: {
                    rowNum: rowIndex + 2, // +2 because we're starting from index 0 and row 1 is headers
                    colLength: rowData.length,
                },
            };
            // First initialize all header fields to empty strings
            headers.forEach(function (header) {
                row[header] = "";
            });
            // Map each column value to its corresponding header
            for (var j = 0; j < Math.min(rowData.length, headers.length); j++) {
                var header = headers[j];
                var value = rowData[j];
                if (value === null || value === undefined) {
                    continue; // Skip processing but keep the empty string initialized earlier
                }
                // Apply type conversions based on metadata if available
                if (columnTypes[header] && value !== "") {
                    var dataType = columnTypes[header];
                    if (dataType === "BOOLEAN") {
                        // Convert to boolean
                        if (typeof value === "string") {
                            value = value.toLowerCase() === "true";
                        }
                    }
                    else if (dataType === "DATE_TIME") {
                        // Convert to Date object
                        try {
                            var dateValue = new Date(value);
                            if (!isNaN(dateValue.getTime())) {
                                value = dateValue;
                            }
                        }
                        catch (e) {
                            // Keep original value if conversion fails
                        }
                    }
                    else if (dataType === "NUMBER") {
                        // Convert to number
                        var numValue = Number(value);
                        if (!isNaN(numValue)) {
                            value = numValue;
                        }
                    }
                }
                else {
                    // Try automatic type inference for common patterns
                    if (typeof value === "string") {
                        // Auto-detect booleans
                        if (value.toLowerCase() === "true" ||
                            value.toLowerCase() === "false") {
                            value = value.toLowerCase() === "true";
                        }
                        // Auto-detect dates (simple pattern for dates like MM/DD/YYYY, etc.)
                        else if (/^\d{1,2}\/\d{1,2}\/\d{4}(\s\d{1,2}:\d{1,2}(:\d{1,2})?)?$/.test(value)) {
                            try {
                                var dateValue = new Date(value);
                                if (!isNaN(dateValue.getTime())) {
                                    value = dateValue;
                                }
                            }
                            catch (e) {
                                // Keep as string if conversion fails
                            }
                        }
                    }
                }
                row[header] = value;
            }
            rows.push(row);
        });
        result[sheetName] = { headers: headers, rows: rows };
    });
    // Make sure all sheets in headersMap have an entry in result
    sheetsToFetch.forEach(function (sheet) {
        if (!result[sheet]) {
            result[sheet] = {
                headers: headersMap[sheet],
                rows: [],
            };
        }
    });
    // Convert data types based on metadata if available
    if (Object.keys(sheetMetadata).length > 0) {
        Object.keys(result).forEach(function (sheetName) {
            var sheetResult = result[sheetName];
            var metadata = sheetMetadata[sheetName];
            if (sheetResult && sheetResult.rows && metadata) {
                sheetResult.rows = sheetResult.rows.map(function (row) {
                    var newRow = __assign({}, row);
                    Object.keys(metadata).forEach(function (column) {
                        var dataType = metadata[column];
                        // Convert based on data type
                        if (dataType === "NUMBER") {
                            newRow[column] = Number(row[column]);
                        }
                        else if (dataType === "BOOLEAN") {
                            newRow[column] = row[column] === "TRUE";
                        }
                        else if (dataType === "DATE" || dataType === "DATETIME") {
                            newRow[column] = new Date(row[column]);
                        }
                        // Add more conversions as needed
                    });
                    return newRow;
                });
            }
        });
    }
    return result;
}
function getInternal(gqueryTableFactory, options) {
    var gqueryTable = gqueryTableFactory.gQueryTable;
    var gquery = gqueryTable.gquery;
    // Determine which sheets we need to read from
    var sheetsToRead = [gqueryTable.sheetName];
    // Add all join sheets
    if (gqueryTableFactory.joinOption.length > 0) {
        gqueryTableFactory.joinOption.forEach(function (join) {
            if (!sheetsToRead.includes(join.sheetName)) {
                sheetsToRead.push(join.sheetName);
            }
        });
    }
    // Read data from all required sheets at once
    var results = gquery.getMany(sheetsToRead, options);
    // If the main sheet doesn't exist or has no data
    if (!results[gqueryTable.sheetName] ||
        results[gqueryTable.sheetName].rows.length === 0) {
        return { headers: [], rows: [] };
    }
    // Get data for the primary table
    var result = results[gqueryTable.sheetName];
    var rows = result.rows;
    var headers = result.headers;
    // Process each join sequentially
    if (gqueryTableFactory.joinOption.length > 0) {
        gqueryTableFactory.joinOption.forEach(function (joinConfig) {
            var sheetName = joinConfig.sheetName, sheetColumn = joinConfig.sheetColumn, joinColumn = joinConfig.joinColumn, columnsToReturn = joinConfig.columnsToReturn;
            var joinData = results[sheetName];
            if (!joinData || !joinData.rows || joinData.rows.length === 0) {
                return; // Skip this join
            }
            // Create join lookup table
            var joinMap = {};
            // Check if the join column exists in the join table
            var joinHeaders = joinData.headers;
            if (!joinHeaders.includes(sheetColumn)) {
                return; // Skip this join
            }
            joinData.rows.forEach(function (joinRow) {
                var joinKey = String(joinRow[sheetColumn]);
                if (!joinMap[joinKey]) {
                    joinMap[joinKey] = [];
                }
                joinMap[joinKey].push(joinRow);
            });
            // Perform the join operation
            rows = rows.map(function (row) {
                var localJoinValue = row[joinColumn];
                var joinedRows = joinMap[String(localJoinValue)] || [];
                // Create joined row with all join table fields
                var joinedRow = __assign({}, row);
                joinedRows.forEach(function (joinRow, index) {
                    // Determine which columns to include from join
                    var columnsToInclude = columnsToReturn ||
                        Object.keys(joinRow).filter(function (key) { return key !== "__meta" && key !== sheetColumn; });
                    columnsToInclude.forEach(function (key) {
                        if (joinRow.hasOwnProperty(key) && key !== "__meta") {
                            // For multiple joined rows, add suffix _1, _2, etc.
                            var suffix = joinedRows.length > 1 ? "_".concat(index + 1) : "";
                            var targetKey = key === sheetColumn ? key : "".concat(key).concat(suffix);
                            joinedRow[targetKey] = joinRow[key];
                        }
                    });
                });
                return joinedRow;
            });
        });
    }
    // Apply filter if specified
    if (gqueryTableFactory.filterOption) {
        rows = rows.filter(gqueryTableFactory.filterOption);
    }
    // Apply select if specified
    if (gqueryTableFactory.selectOption &&
        gqueryTableFactory.selectOption.length > 0) {
        // Create a map to track columns from joined tables
        var joinedColumns_1 = new Set();
        // Collect all columns from joined tables
        rows.forEach(function (row) {
            Object.keys(row).forEach(function (key) {
                // If the column is not in the original headers, it's from a join
                if (!headers.includes(key) && key !== "__meta") {
                    joinedColumns_1.add(key);
                }
            });
        });
        // If we have a select option, determine which columns to keep
        var selectedHeaders_1;
        // Check if any of the selected headers is "Model" or "Model_Name"
        // If we're selecting the join columns, we want to include all related joined fields
        if (gqueryTableFactory.selectOption.some(function (header) {
            return header === "Model" ||
                header === "Model_Name" ||
                gqueryTableFactory.joinOption.some(function (j) { return j.joinColumn === header || j.sheetColumn === header; });
        })) {
            // Include all join-related columns and the selected columns
            selectedHeaders_1 = __spreadArray([], gqueryTableFactory.selectOption, true);
            joinedColumns_1.forEach(function (joinCol) {
                selectedHeaders_1.push(joinCol);
            });
        }
        else {
            // Otherwise only include explicitly selected columns
            selectedHeaders_1 = __spreadArray([], gqueryTableFactory.selectOption, true);
        }
        // Remove duplicates
        selectedHeaders_1 = __spreadArray([], new Set(selectedHeaders_1), true);
        // Filter rows to only include selected columns
        rows = rows.map(function (row) {
            var selectedRow = {
                __meta: row.__meta,
            };
            selectedHeaders_1.forEach(function (header) {
                if (row.hasOwnProperty(header)) {
                    selectedRow[header] = row[header];
                }
            });
            return selectedRow;
        });
        // Update headers to include both selected and joined columns
        return {
            headers: selectedHeaders_1,
            rows: rows,
        };
    }
    return {
        headers: headers,
        rows: rows,
    };
}
function queryInternal(gqueryTable, query) {
    var sheet = gqueryTable.sheet;
    var range = sheet.getDataRange();
    var replaced = query;
    for (var i = 0; i < range.getLastColumn() - 1; i++) {
        var rng = sheet.getRange(1, i + 1);
        var name = rng.getValue();
        var letter = rng.getA1Notation().match(/([A-Z]+)/)[0];
        replaced = replaced.replaceAll(name, letter);
    }
    var response = UrlFetchApp.fetch(Utilities.formatString("https://docs.google.com/spreadsheets/d/%s/gviz/tq?tq=%s%s%s%s", sheet.getParent().getId(), encodeURIComponent(replaced), "&sheet=" + sheet.getName(), typeof range === "string" ? "&range=" + range : "", "&headers=1"), {
        headers: {
            Authorization: "Bearer " + ScriptApp.getOAuthToken(),
        },
    });
    var jsonResponse = JSON.parse(response
        .getContentText()
        .replace("/*O_o*/\n", "")
        .replace(/(google\.visualization\.Query\.setResponse\()|(\);)/gm, "")), table = jsonResponse.table;
    // Extract column headers
    var headers = table.cols.map(function (col) { return col.label; });
    // Map rows to proper GQueryRow format
    var rows = table.rows.map(function (row, _rowIndex) {
        var rowObj = {
            __meta: {
                rowNum: -1, // +2 because we're starting from index 0 and row 1 is headers
                colLength: row.c.length,
            },
        };
        // Initialize all header fields to empty strings
        headers.forEach(function (header) {
            rowObj[header] = "";
        });
        // Populate row data
        table.cols.forEach(function (col, colIndex) {
            var cellData = row.c[colIndex];
            if (cellData) {
                // Use formatted value if available, otherwise use raw value
                var value = cellData.f !== null && cellData.f !== undefined
                    ? cellData.f
                    : cellData.v;
                // Convert known data types
                if (value instanceof Date) {
                    // Keep as Date object
                }
                else if (typeof value === "string") {
                    // Try to auto-detect date strings
                    if (/^\d{1,2}\/\d{1,2}\/\d{4}(\s\d{1,2}:\d{1,2}(:\d{1,2})?)?$/.test(value)) {
                        try {
                            var dateValue = new Date(value);
                            if (!isNaN(dateValue.getTime())) {
                                value = dateValue;
                            }
                        }
                        catch (e) {
                            // Keep as string if conversion fails
                        }
                    }
                }
                rowObj[col.label] = value;
            }
        });
        return rowObj;
    });
    // Return in the standard GQueryResult format
    return {
        headers: headers,
        rows: rows,
    };
}
