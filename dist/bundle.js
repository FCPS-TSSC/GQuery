function readImplementation(spreadsheetId, sheetName, options = {
    dateTimeRenderOption: DateTimeRenderOption.FORMATTED_STRING,
    valueRenderOption: ValueRenderOption.FORMATTED_VALUE,
}) {
    var sheets = [sheetName];
    if (options === null || options === void 0 ? void 0 : options.join) {
        sheets = [...new Set([...sheets, ...Object.keys(options.join)])];
    }
    const optionsWithoutFilterJoin = {
        valueRenderOption: options.valueRenderOption,
        dateTimeRenderOption: options.dateTimeRenderOption,
    };
    const allSheetData = readManyImplementation(spreadsheetId, sheets, optionsWithoutFilterJoin);
    // Get the main sheet data
    let mainData = allSheetData[sheetName];
    // Apply filter if provided
    if (options === null || options === void 0 ? void 0 : options.filter) {
        mainData = {
            headers: mainData.headers,
            values: mainData.values.filter((row) => options.filter(row)),
        };
    }
    // Apply join if provided
    if ((options === null || options === void 0 ? void 0 : options.join) && Object.keys(options.join).length > 0) {
        const joinedData = applyJoin(mainData, allSheetData, Array.isArray(sheetName) ? sheetName[0] : sheetName, options.join);
        return joinedData;
    }
    return mainData;
}
function readManyImplementation(spreadsheetId, sheetNames, options = {
    dateTimeRenderOption: DateTimeRenderOption.FORMATTED_STRING,
    valueRenderOption: ValueRenderOption.FORMATTED_VALUE,
}) {
    var _a, _b, _c;
    if (options.filter || options.join) {
        throw new Error("Filter and join options are not supported in readManyImplementation.");
    }
    // Get sheet data using the Sheets API batchGet method
    const batchResponse = (_c = (_b = (_a = Sheets === null || Sheets === void 0 ? void 0 : Sheets.Spreadsheets) === null || _a === void 0 ? void 0 : _a.Values) === null || _b === void 0 ? void 0 : _b.batchGet) === null || _c === void 0 ? void 0 : _c.call(_b, spreadsheetId, {
        ranges: sheetNames,
        valueRenderOption: options === null || options === void 0 ? void 0 : options.valueRenderOption,
        dateTimeRenderOption: options === null || options === void 0 ? void 0 : options.dateTimeRenderOption,
    });
    // Process the response into the expected format
    const response = {};
    if (batchResponse && batchResponse.valueRanges) {
        batchResponse.valueRanges.forEach((valueRange, index) => {
            const currentSheet = sheetNames[index];
            if (valueRange.values && valueRange.values.length > 0) {
                response[currentSheet] = {
                    headers: valueRange.values[0],
                    rows: valueRange.values.slice(1).filter((row) => row.length > 0), // Filter out empty rows
                };
            }
            else {
                response[currentSheet] = { headers: [], rows: [] };
            }
        });
    }
    return sheetNames.reduce((acc, sheetName) => {
        const sheetData = response[sheetName];
        acc[sheetName] = processSheetData(sheetData);
        return acc;
    }, {});
}
// Helper function to process raw sheet data into rows with header keys
function processSheetData(sheetData) {
    if (!sheetData) {
        return { headers: [], values: [] };
    }
    const { headers, rows } = sheetData;
    const values = rows.map((row, rowIndex) => {
        const obj = row.reduce((acc, cellValue, index) => {
            acc[headers[index]] = cellValue;
            return acc;
        }, {});
        // Attach __meta property as required by Row type
        obj.__meta = {
            rowNum: rowIndex + 2, // +2 because headers are row 1, and rows is 0-based
            colLength: row.length,
        };
        return obj;
    });
    return { headers, values };
}
// Helper function to apply join operations
function applyJoin(mainData, allSheetData, mainSheetName, join) {
    // Create result with main data's headers
    const result = {
        headers: [...mainData.headers],
        values: [...mainData.values],
    };
    // Process each main data row
    result.values = mainData.values.map((mainRow) => {
        const enrichedRow = Object.assign({}, mainRow);
        // For each joined sheet
        Object.entries(join).forEach(([sheetName, joinConfig]) => {
            if (!allSheetData[sheetName])
                return;
            const sheetData = allSheetData[sheetName];
            // Find matching rows in the joined sheet
            const matchingRows = sheetData.values.filter((joinRow) => {
                // Check all join conditions defined for this sheet
                const conditions = joinConfig.on;
                if (!conditions)
                    return false;
                return Object.entries(conditions).every(([mainCol, joinCol]) => {
                    return mainRow[mainCol] === joinRow[joinCol];
                });
            });
            // Add matching data to the main row
            if (matchingRows.length > 0) {
                // If includes is specified, only add those fields
                if (joinConfig.include && joinConfig.include.length > 0) {
                    joinConfig.include.forEach((field) => {
                        enrichedRow[`${sheetName}_${field}`] = matchingRows[0][field];
                    });
                }
                else {
                    // Otherwise add all fields with sheet name prefix to avoid collisions
                    Object.entries(matchingRows[0]).forEach(([key, value]) => {
                        if (key !== "__meta") {
                            enrichedRow[`${sheetName}_${key}`] = value;
                        }
                    });
                }
            }
        });
        return enrichedRow;
    });
    // Update headers to include any new fields
    const allKeys = new Set();
    result.values.forEach((row) => {
        Object.keys(row).forEach((key) => {
            if (key !== "__meta") {
                allKeys.add(key);
            }
        });
    });
    result.headers = Array.from(allKeys);
    return result;
}

/**
 * Updates rows in a Google Sheet
 * @param spreadsheetId The ID of the spreadsheet
 * @param sheetName The name of the sheet to update
 * @param data Array of row objects to update
 * @param options Additional options for the update operation
 * @returns Object containing update statistics
 */
function updateImplementation(spreadsheetId, sheetName, data, options) {
    if (!data || data.length === 0) {
        return { updatedRows: 0 };
    }
    // Sort data by row number to optimize updates
    const sortedData = [...data].sort((a, b) => a.__meta.rowNum - b.__meta.rowNum);
    // Get all headers from the data to ensure we update all fields
    const allHeaders = new Set();
    sortedData.forEach((row) => {
        Object.keys(row).forEach((key) => {
            if (key !== "__meta") {
                allHeaders.add(key);
            }
        });
    });
    const headers = Array.from(allHeaders);
    // Prepare the values for batch update
    const updates = [];
    sortedData.forEach((row) => {
        // Convert the row object back to an array in the correct header order
        const rowValues = headers.map((header) => {
            return row[header] !== undefined ? row[header] : "";
        });
        // Create a range for this row (A2:Z2 format)
        const rowNum = row.__meta.rowNum;
        const range = `${sheetName}!A${rowNum}:${getColumnLetter(headers.length)}${rowNum}`;
        updates.push({
            range,
            values: [rowValues],
        });
    });
    // Perform batch update
    let updatedCount = 0;
    if (updates.length > 0) {
        try {
            // Apply default options and override with provided options
            const updateOptions = {
                data: updates,
                valueInputOption: (options === null || options === void 0 ? void 0 : options.valueInputOption) || "USER_ENTERED",
                includeValuesInResponse: (options === null || options === void 0 ? void 0 : options.includeValuesInResponse) === undefined
                    ? true
                    : options.includeValuesInResponse,
                responseDateTimeRenderOption: options === null || options === void 0 ? void 0 : options.responseDateTimeRenderOption,
                responseValueRenderOption: options === null || options === void 0 ? void 0 : options.responseValueRenderOption,
            };
            const response = Sheets.Spreadsheets.Values.batchUpdate(updateOptions, spreadsheetId);
            updatedCount = response.totalUpdatedRows || 0;
            // Extract updated values from the response if includeValuesInResponse is true
            if (updateOptions.includeValuesInResponse && response.responses) {
                const updatedRowsData = response.responses
                    .filter((resp) => resp.updatedData && resp.updatedData.values)
                    .map((resp) => {
                    const values = resp.updatedData.values[0]; // First row of updated values
                    // Extract row number from the range
                    const rangeMatch = resp.updatedData.range
                        .split("!")[1]
                        .match(/\d+/);
                    if (!rangeMatch) {
                        throw new Error(`Could not parse row number from range: ${resp.updatedData.range}`);
                    }
                    const rowNum = parseInt(rangeMatch[0]);
                    // Find the corresponding row in sortedData by row number
                    const originalRowData = sortedData.find((row) => row.__meta.rowNum === rowNum);
                    if (!originalRowData) {
                        throw new Error(`Could not find original row data for row number: ${rowNum}`);
                    }
                    // Convert back to object with headers
                    const rowObject = headers.reduce((obj, header, idx) => {
                        obj[header] = values[idx];
                        return obj;
                    }, {});
                    // Add meta information from the original row
                    rowObject.__meta = originalRowData.__meta;
                    return rowObject;
                });
                return {
                    updatedRows: updatedCount,
                    updatedRowsData,
                };
            }
            return { updatedRows: updatedCount };
        }
        catch (error) {
            throw new Error(`Failed to update sheet: ${error}`);
        }
    }
    return { updatedRows: updatedCount };
}
/**
 * Converts a column number to column letter (e.g., 1 -> A, 27 -> AA)
 */
function getColumnLetter(columnNumber) {
    let dividend = columnNumber;
    let columnLetter = "";
    while (dividend > 0) {
        const modulo = (dividend - 1) % 26;
        columnLetter = String.fromCharCode(65 + modulo) + columnLetter;
        dividend = Math.floor((dividend - modulo) / 26);
    }
    return columnLetter;
}

// filepath: c:\Users\liamr\Projects\GQuery\src\create.ts
/**
 * Creates data in a Google Sheet
 * @param spreadsheetId The ID of the spreadsheet
 * @param sheetName The name of the sheet to create data in
 * @param data Array of objects to create as rows
 * @param options Additional options for the create operation
 * @returns Object containing create statistics
 */
function createImplementation(spreadsheetId, sheetName, data, options = {
    responseValueRenderOption: ValueRenderOption.FORMATTED_VALUE,
    responseDateTimeRenderOption: DateTimeRenderOption.FORMATTED_STRING,
    includeValuesInResponse: true,
}) {
    if (!data || data.length === 0) {
        return { createdRows: 0, sheetName };
    }
    // Get all unique headers from the data
    const allHeaders = new Set();
    data.forEach((row) => {
        Object.keys(row).forEach((key) => {
            allHeaders.add(key);
        });
    });
    const headers = Array.from(allHeaders);
    const values = [];
    // Convert each data object to an array of values
    data.forEach((row) => {
        const rowValues = headers.map((header) => {
            return row[header] !== undefined ? row[header] : "";
        });
        values.push(rowValues);
    });
    // Use Sheets API to append values
    const valueRange = {
        values: values,
    };
    // Configure request options
    const appendOptions = {
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
    };
    // Include response options if specified
    if (options.includeValuesInResponse) {
        appendOptions.includeValuesInResponse = true;
        if (options.responseValueRenderOption) {
            appendOptions.responseValueRenderOption =
                options.responseValueRenderOption;
        }
        if (options.responseDateTimeRenderOption) {
            appendOptions.responseDateTimeRenderOption =
                options.responseDateTimeRenderOption;
        }
    }
    // Execute the append request
    const response = Sheets.Spreadsheets.Values.append(valueRange, spreadsheetId, sheetName, appendOptions);
    // Return result with added rows if requested
    const result = {
        createdRows: data.length,
        sheetName,
    };
    if (options.includeValuesInResponse &&
        response.updates &&
        response.updates.updatedData &&
        response.updates.updatedData.values) {
        result.addedRows = response.updates.updatedData.values;
    }
    return result;
}

class GQuery {
    constructor(spreadsheetId) {
        this.spreadsheetId = spreadsheetId
            ? spreadsheetId
            : SpreadsheetApp.getActiveSpreadsheet().getId();
    }
    create(sheetName, data, options) {
        return createImplementation(this.spreadsheetId, sheetName, data, options);
    }
    read(sheetName, options) {
        return readImplementation(this.spreadsheetId, sheetName, options);
    }
    readMany(sheetNames, options) {
        return readManyImplementation(this.spreadsheetId, sheetNames, options);
    }
    update(sheetName, data, options) {
        return updateImplementation(this.spreadsheetId, sheetName, data, options);
    }
}
var ValueRenderOption;
(function (ValueRenderOption) {
    ValueRenderOption["FORMATTED_VALUE"] = "FORMATTED_VALUE";
    ValueRenderOption["UNFORMATTED_VALUE"] = "UNFORMATTED_VALUE";
    ValueRenderOption["FORMULA"] = "FORMULA";
})(ValueRenderOption || (ValueRenderOption = {}));
var DateTimeRenderOption;
(function (DateTimeRenderOption) {
    DateTimeRenderOption["FORMATTED_STRING"] = "FORMATTED_STRING";
    DateTimeRenderOption["SERIAL_NUMBER"] = "SERIAL_NUMBER";
})(DateTimeRenderOption || (DateTimeRenderOption = {}));

export { DateTimeRenderOption, GQuery, ValueRenderOption };
//# sourceMappingURL=bundle.js.map
