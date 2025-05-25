var GQuery = (function (exports) {
    'use strict';

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
        update(sheetName, data) { }
    }

    exports.GQuery = GQuery;

    return exports;

})({});
//# sourceMappingURL=bundle.global.js.map
