function readImplementation(spreadsheetId, sheetName, options = {
    dateTimeRenderOption: DateTimeRenderOption.FORMATTED_STRING,
    valueRenderOption: ValueRenderOption.FORMATTED_VALUE,
}) {
    var _a, _b, _c;
    var sheets = Array.isArray(sheetName) ? sheetName : [sheetName];
    if ((options === null || options === void 0 ? void 0 : options.join) && "sheets" in options.join) {
        sheets = [...new Set([...sheets, ...options.join.sheets])];
    }
    // Get sheet data using the Sheets API batchGet method
    const batchResponse = (_c = (_b = (_a = Sheets === null || Sheets === void 0 ? void 0 : Sheets.Spreadsheets) === null || _a === void 0 ? void 0 : _a.Values) === null || _b === void 0 ? void 0 : _b.batchGet) === null || _c === void 0 ? void 0 : _c.call(_b, spreadsheetId, {
        ranges: sheets,
        valueRenderOption: options === null || options === void 0 ? void 0 : options.valueRenderOption,
        dateTimeRenderOption: options === null || options === void 0 ? void 0 : options.dateTimeRenderOption,
    });
    // Process the response into the expected format
    const response = {};
    if (batchResponse && batchResponse.valueRanges) {
        batchResponse.valueRanges.forEach((valueRange, index) => {
            const currentSheet = sheets[index];
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
    // Process primary sheet data
    let mainData = processSheetData(response[sheetName]);
    // Apply filter if provided
    if (options === null || options === void 0 ? void 0 : options.filter) {
        mainData = {
            headers: mainData.headers,
            values: mainData.values.filter((row) => options.filter(row)),
        };
    }
    // Apply join if provided
    if ((options === null || options === void 0 ? void 0 : options.join) && options.join.sheets && options.join.sheets.length > 0) {
        const joinedData = applyJoin(mainData, response, sheetName, options.join);
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
    const values = rows.map((row) => {
        return row.reduce((obj, cellValue, index) => {
            obj[headers[index]] = cellValue;
            return obj;
        }, {});
    });
    return { headers, values };
}
// Helper function to apply join operations
function applyJoin(mainData, allSheetData, mainSheetName, join) {
    // Process joined sheets data
    const joinedSheetsData = join.sheets.reduce((acc, sheetName) => {
        if (allSheetData[sheetName]) {
            acc[sheetName] = processSheetData(allSheetData[sheetName]);
        }
        return acc;
    }, {});
    // If no where function provided, return unmodified data
    if (!join.where) {
        return mainData;
    }
    const result = {
        headers: [...mainData.headers],
        values: [],
    };
    // Create a context object with all data
    const context = {};
    // Add the main sheet data as an array of objects
    context[mainSheetName] = mainData.values;
    // Add all joined sheets' data
    Object.entries(joinedSheetsData).forEach(([sheetName, data]) => {
        context[sheetName] = data.values;
    });
    // Capture the returned object from array methods like some()
    let capturedReturnValue = null;
    // Override Array.prototype.some for this execution
    const originalSome = Array.prototype.some;
    Array.prototype.some = function (callback) {
        for (let i = 0; i < this.length; i++) {
            const returnValue = callback(this[i], i, this);
            if (returnValue && typeof returnValue === "object") {
                // Capture the returned object
                capturedReturnValue = returnValue;
            }
            if (returnValue)
                return true;
        }
        return false;
    };
    try {
        // Apply the where function with the context
        const whereResult = join.where(context);
        // Process the result based on its type
        if (Array.isArray(whereResult)) {
            // If an array is returned, use it as the values
            result.values = whereResult;
            // Update headers if new properties were added in the returned objects
            if (whereResult.length > 0) {
                const allKeys = new Set(result.headers);
                whereResult.forEach((row) => {
                    Object.keys(row).forEach((key) => allKeys.add(key));
                });
                result.headers = Array.from(allKeys);
            }
        }
        else if (whereResult === true && capturedReturnValue) {
            // If true is returned from an array method like some() and we captured a return value
            // Only include the values from the original item and specifically returned properties
            result.values = mainData.values.map((originalItem) => {
                // Start with the original item
                const resultItem = Object.assign({}, originalItem);
                // Only add the specific properties from the captured return value
                if (capturedReturnValue) {
                    Object.keys(capturedReturnValue).forEach((key) => {
                        if (!originalItem.hasOwnProperty(key)) {
                            resultItem[key] = capturedReturnValue[key];
                        }
                    });
                }
                return resultItem;
            });
            // Update headers to include the new properties
            if (result.values.length > 0 && capturedReturnValue) {
                const newKeys = Object.keys(capturedReturnValue).filter((key) => !result.headers.includes(key) &&
                    !mainData.values[0].hasOwnProperty(key));
                if (newKeys.length > 0) {
                    result.headers.push(...newKeys);
                }
            }
        }
        else if (whereResult && typeof whereResult === "object") {
            // If a single object is returned, use it as a single row
            result.values.push(whereResult);
            // Update headers if new properties were added
            const newKeys = Object.keys(whereResult).filter((key) => !result.headers.includes(key));
            if (newKeys.length > 0) {
                result.headers.push(...newKeys);
            }
        }
    }
    finally {
        // Restore the original method
        Array.prototype.some = originalSome;
    }
    return result;
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

class GQuery {
    constructor(spreadsheetId) {
        this.spreadsheetId = spreadsheetId
            ? spreadsheetId
            : SpreadsheetApp.getActiveSpreadsheet().getId();
    }
    //   create(sheetName: string, data: any[]) {
    //     // TODO:
    //   }
    read(sheetName, options) {
        return readImplementation(this.spreadsheetId, sheetName, options);
    }
    readMany(sheetNames, options) {
        return readManyImplementation(this.spreadsheetId, sheetNames, options);
    }
}

export { GQuery };
//# sourceMappingURL=bundle.js.map
