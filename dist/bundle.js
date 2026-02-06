/**
 * Exponential backoff handler for Google Sheets API calls
 * Handles rate limiting (429) and quota exceeded errors
 * @param fn Function to execute with retry logic
 * @param retries Maximum number of retry attempts (default: 16)
 * @returns Result of the function execution
 */
function callHandler(fn, retries = 16) {
    let attempt = 0;
    while (attempt < retries) {
        try {
            return fn();
        }
        catch (error) {
            const errorMessage = (error === null || error === void 0 ? void 0 : error.message) || String(error);
            // Check if it's a rate limit or quota error
            const isRateLimitError = errorMessage.includes("429") ||
                errorMessage.includes("Quota exceeded") ||
                errorMessage.includes("Rate Limit Exceeded");
            if (isRateLimitError) {
                attempt++;
                if (attempt >= retries) {
                    throw new Error(`Max retries (${retries}) reached for Google Sheets API call. Last error: ${errorMessage}`);
                }
                // Exponential backoff with jitter, capped at 64 seconds
                const backoffDelay = Math.min(Math.pow(2, attempt) * 1000 + Math.random() * 1000, 64000);
                console.log(`Rate limit hit, retrying in ${Math.round(backoffDelay)}ms (attempt ${attempt}/${retries})`);
                Utilities.sleep(backoffDelay);
            }
            else {
                // Not a rate limit error, rethrow immediately
                throw error;
            }
        }
    }
    throw new Error("Unexpected state: Max retries reached without throwing error");
}

/**
 * How values should be rendered in the output
 * @see https://developers.google.com/sheets/api/reference/rest/v4/ValueRenderOption
 */
var ValueRenderOption;
(function (ValueRenderOption) {
    /** Values will be calculated and formatted according to cell formatting */
    ValueRenderOption["FORMATTED_VALUE"] = "FORMATTED_VALUE";
    /** Values will be calculated but not formatted */
    ValueRenderOption["UNFORMATTED_VALUE"] = "UNFORMATTED_VALUE";
    /** Values will not be calculated; formulas will be returned as-is */
    ValueRenderOption["FORMULA"] = "FORMULA";
})(ValueRenderOption || (ValueRenderOption = {}));
/**
 * How dates and times should be rendered in the output
 * @see https://developers.google.com/sheets/api/reference/rest/v4/DateTimeRenderOption
 */
var DateTimeRenderOption;
(function (DateTimeRenderOption) {
    /** Dates and times will be rendered as strings according to cell formatting */
    DateTimeRenderOption["FORMATTED_STRING"] = "FORMATTED_STRING";
    /** Dates and times will be rendered as serial numbers */
    DateTimeRenderOption["SERIAL_NUMBER"] = "SERIAL_NUMBER";
})(DateTimeRenderOption || (DateTimeRenderOption = {}));

/**
 * Parse raw sheet values into GQueryRow objects with metadata
 * @param headers Column headers from the sheet
 * @param values Raw values from the sheet (without header row)
 * @returns Array of GQueryRow objects
 */
function parseRows(headers, values) {
    return values.map((row, rowIndex) => {
        const obj = {
            __meta: {
                rowNum: rowIndex + 2, // +2 because header is row 1, data starts at row 2
                colLength: headers.length,
            },
        };
        headers.forEach((header, i) => {
            obj[header] = row[i] !== undefined ? row[i] : "";
        });
        return obj;
    });
}
/**
 * Fetch all data from a sheet including headers
 * @param spreadsheetId The ID of the spreadsheet
 * @param sheetName The name of the sheet to fetch
 * @returns Object containing headers and rows
 */
function fetchSheetData(spreadsheetId, sheetName) {
    const response = callHandler(() => Sheets.Spreadsheets.Values.get(spreadsheetId, sheetName));
    const values = response.values || [];
    if (values.length === 0) {
        return { headers: [], rows: [] };
    }
    const headers = values[0].map((h) => String(h));
    const rows = parseRows(headers, values.slice(1));
    return { headers, rows };
}

/**
 * Convert row values to appropriate types (boolean, date, number)
 * Optimized to reduce redundant type checking
 */
function convertRowTypes(row, headers) {
    const newRow = { __meta: row.__meta };
    headers.forEach((header) => {
        let value = row[header];
        // Skip empty values
        if (value === undefined || value === null || value === "") {
            newRow[header] = value;
            return;
        }
        // Only process string values for type conversion
        if (typeof value === "string") {
            const lowerValue = value.toLowerCase();
            // Check for boolean
            if (lowerValue === "true" || lowerValue === "false") {
                newRow[header] = lowerValue === "true";
                return;
            }
            // Check for date pattern (MM/DD/YYYY or MM/DD/YYYY HH:MM:SS)
            if (/^\d{1,2}\/\d{1,2}\/\d{4}(\s\d{1,2}:\d{1,2}(:\d{1,2})?)?$/.test(value)) {
                const dateValue = new Date(value);
                if (!isNaN(dateValue.getTime())) {
                    newRow[header] = dateValue;
                    return;
                }
            }
        }
        // Keep original value if no conversion applied
        newRow[header] = value;
    });
    return newRow;
}
function getManyInternal(gquery, sheetNames, options) {
    if (!sheetNames || sheetNames.length === 0) {
        return {};
    }
    const valueRenderOption = (options === null || options === void 0 ? void 0 : options.valueRenderOption) || ValueRenderOption.FORMATTED_VALUE;
    const dateTimeRenderOption = (options === null || options === void 0 ? void 0 : options.dateTimeRenderOption) || DateTimeRenderOption.FORMATTED_STRING;
    const result = {};
    // Fetch data using batchGet for better performance
    const dataResponse = callHandler(() => Sheets.Spreadsheets.Values.batchGet(gquery.spreadsheetId, {
        ranges: sheetNames,
        valueRenderOption,
        dateTimeRenderOption,
    }));
    if (!dataResponse || !dataResponse.valueRanges) {
        sheetNames.forEach((sheet) => {
            result[sheet] = { headers: [], rows: [] };
        });
        return result;
    }
    dataResponse.valueRanges.forEach((valueRange, index) => {
        const sheetName = sheetNames[index];
        if (!valueRange.values || valueRange.values.length === 0) {
            result[sheetName] = { headers: [], rows: [] };
            return;
        }
        const headers = valueRange.values[0].map((h) => String(h));
        let rows = parseRows(headers, valueRange.values.slice(1));
        // Apply type conversion to rows
        rows = rows.map((row) => convertRowTypes(row, headers));
        result[sheetName] = { headers, rows };
    });
    return result;
}
function getInternal(gqueryTableFactory, options) {
    const gqueryTable = gqueryTableFactory.gQueryTable;
    const gquery = gqueryTable.gquery;
    // Determine which sheets we need to read from
    const sheetsToRead = [gqueryTable.sheetName];
    // Add all join sheets
    if (gqueryTableFactory.joinOption.length > 0) {
        gqueryTableFactory.joinOption.forEach((join) => {
            if (!sheetsToRead.includes(join.sheetName)) {
                sheetsToRead.push(join.sheetName);
            }
        });
    }
    // Read data from all required sheets at once
    const results = gquery.getMany(sheetsToRead, options);
    // If the main sheet doesn't exist or has no data
    if (!results[gqueryTable.sheetName] ||
        results[gqueryTable.sheetName].rows.length === 0) {
        return { headers: [], rows: [] };
    }
    // Get data for the primary table
    let result = results[gqueryTable.sheetName];
    let rows = result.rows;
    let headers = result.headers;
    // Process each join sequentially
    if (gqueryTableFactory.joinOption.length > 0) {
        gqueryTableFactory.joinOption.forEach((joinConfig) => {
            const { sheetName, sheetColumn, joinColumn, columnsToReturn } = joinConfig;
            const joinData = results[sheetName];
            if (!joinData || !joinData.rows || joinData.rows.length === 0) {
                return; // Skip this join
            }
            // Create join lookup table
            const joinMap = {};
            // Check if the join column exists in the join table
            const joinHeaders = joinData.headers;
            if (!joinHeaders.includes(sheetColumn)) {
                return; // Skip this join
            }
            joinData.rows.forEach((joinRow) => {
                const joinKey = String(joinRow[sheetColumn]);
                if (!joinMap[joinKey]) {
                    joinMap[joinKey] = [];
                }
                joinMap[joinKey].push(joinRow);
            });
            // Perform the join operation
            rows = rows.map((row) => {
                const localJoinValue = row[joinColumn];
                const joinedRows = joinMap[String(localJoinValue)] || [];
                // Create joined row with all join table fields
                const joinedRow = Object.assign({}, row);
                joinedRows.forEach((joinRow, index) => {
                    // Determine which columns to include from join
                    const columnsToInclude = columnsToReturn ||
                        Object.keys(joinRow).filter((key) => key !== "__meta" && key !== sheetColumn);
                    columnsToInclude.forEach((key) => {
                        if (joinRow.hasOwnProperty(key) && key !== "__meta") {
                            // For multiple joined rows, add suffix _1, _2, etc.
                            const suffix = joinedRows.length > 1 ? `_${index + 1}` : "";
                            const targetKey = key === sheetColumn ? key : `${key}${suffix}`;
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
        const joinedColumns = new Set();
        // Collect all columns from joined tables
        rows.forEach((row) => {
            Object.keys(row).forEach((key) => {
                // If the column is not in the original headers, it's from a join
                if (!headers.includes(key) && key !== "__meta") {
                    joinedColumns.add(key);
                }
            });
        });
        // If we have a select option, determine which columns to keep
        let selectedHeaders;
        // Check if any of the selected headers is "Model" or "Model_Name"
        // If we're selecting the join columns, we want to include all related joined fields
        if (gqueryTableFactory.selectOption.some((header) => header === "Model" ||
            header === "Model_Name" ||
            gqueryTableFactory.joinOption.some((j) => j.joinColumn === header || j.sheetColumn === header))) {
            // Include all join-related columns and the selected columns
            selectedHeaders = [...gqueryTableFactory.selectOption];
            joinedColumns.forEach((joinCol) => {
                selectedHeaders.push(joinCol);
            });
        }
        else {
            // Otherwise only include explicitly selected columns
            selectedHeaders = [...gqueryTableFactory.selectOption];
        }
        // Remove duplicates
        selectedHeaders = [...new Set(selectedHeaders)];
        // Filter rows to only include selected columns
        rows = rows.map((row) => {
            const selectedRow = {
                __meta: row.__meta,
            };
            selectedHeaders.forEach((header) => {
                if (row.hasOwnProperty(header)) {
                    selectedRow[header] = row[header];
                }
            });
            return selectedRow;
        });
        // Update headers to include both selected and joined columns
        return {
            headers: selectedHeaders,
            rows,
        };
    }
    return {
        headers,
        rows,
    };
}
function queryInternal(gqueryTable, query) {
    var _a;
    const sheet = gqueryTable.sheet;
    const range = sheet.getDataRange();
    // Build column name to letter mapping
    let replaced = query;
    const lastColumn = range.getLastColumn();
    for (let i = 0; i < lastColumn; i++) {
        const rng = sheet.getRange(1, i + 1);
        const name = rng.getValue();
        const letter = (_a = rng.getA1Notation().match(/([A-Z]+)/)) === null || _a === void 0 ? void 0 : _a[0];
        if (letter && name) {
            replaced = replaced.replaceAll(name, letter);
        }
    }
    // Build query URL
    const url = Utilities.formatString("https://docs.google.com/spreadsheets/d/%s/gviz/tq?tq=%s&sheet=%s%s&headers=1", sheet.getParent().getId(), encodeURIComponent(replaced), sheet.getName(), typeof range === "string" ? "&range=" + range : "");
    // Fetch with authorization
    const response = UrlFetchApp.fetch(url, {
        headers: {
            Authorization: "Bearer " + ScriptApp.getOAuthToken(),
        },
    });
    // Parse response
    const jsonResponse = JSON.parse(response
        .getContentText()
        .replace("/*O_o*/\n", "")
        .replace(/(google\.visualization\.Query\.setResponse\()|(\);)/gm, ""));
    const table = jsonResponse.table;
    // Extract column headers
    const headers = table.cols.map((col) => col.label);
    // Map rows to proper GQueryRow format
    const rows = table.rows.map((row) => {
        const rowObj = {
            __meta: {
                rowNum: -1, // Query results don't have reliable row numbers
                colLength: row.c.length,
            },
        };
        // Populate row data
        table.cols.forEach((col, colIndex) => {
            const cellData = row.c[colIndex];
            let value = "";
            if (cellData) {
                // Use formatted value if available, otherwise use raw value
                value = cellData.f !== null && cellData.f !== undefined
                    ? cellData.f
                    : cellData.v;
                // Convert date strings if needed
                if (typeof value === "string" &&
                    /^\d{1,2}\/\d{1,2}\/\d{4}(\s\d{1,2}:\d{1,2}(:\d{1,2})?)?$/.test(value)) {
                    const dateValue = new Date(value);
                    if (!isNaN(dateValue.getTime())) {
                        value = dateValue;
                    }
                }
            }
            rowObj[col.label] = value;
        });
        return rowObj;
    });
    return {
        headers,
        rows,
    };
}

function updateInternal(gQueryTableFactory, updateFn) {
    const spreadsheetId = gQueryTableFactory.gQueryTable.spreadsheetId;
    const sheetName = gQueryTableFactory.gQueryTable.sheetName;
    const range = sheetName;
    const { headers, rows } = fetchSheetData(spreadsheetId, range);
    if (headers.length === 0) {
        return { rows: [], headers: [] };
    }
    // Filter rows if filter is specified
    const filteredRows = gQueryTableFactory.filterOption
        ? rows.filter((row) => {
            try {
                return gQueryTableFactory.filterOption(row);
            }
            catch (error) {
                console.error("Error filtering row:", error);
                return false;
            }
        })
        : rows;
    // Apply updates to filtered rows
    const updatedRows = filteredRows.map((row) => {
        const updatedRow = Object.assign({}, row);
        try {
            const result = updateFn(updatedRow);
            if (result && typeof result === "object") {
                Object.assign(updatedRow, result);
            }
        }
        catch (error) {
            console.error("Error updating row:", error);
        }
        return updatedRow;
    });
    // Collect changed cells
    const changedCells = new Map();
    updatedRows.forEach((updatedRow) => {
        const rowIndex = updatedRow.__meta.rowNum - 2;
        const originalRow = rows[rowIndex];
        headers.forEach((header, columnIndex) => {
            let updatedValue = updatedRow[header];
            const originalValue = originalRow[header];
            // Convert dates to locale string for comparison
            if (updatedValue instanceof Date) {
                updatedValue = updatedValue.toLocaleString();
            }
            // Skip if values are the same
            if (originalValue === updatedValue)
                return;
            // Only update if value changed or is being set/cleared
            if (updatedValue !== undefined && updatedValue !== null) {
                const columnLetter = getColumnLetter(columnIndex);
                const cellRange = `${sheetName}!${columnLetter}${updatedRow.__meta.rowNum}`;
                changedCells.set(cellRange, [[updatedValue]]);
            }
            else if (originalValue !== undefined && originalValue !== null) {
                const columnLetter = getColumnLetter(columnIndex);
                const cellRange = `${sheetName}!${columnLetter}${updatedRow.__meta.rowNum}`;
                changedCells.set(cellRange, [[updatedValue || ""]]);
            }
        });
    });
    // Perform batch update if there are changes
    if (changedCells.size > 0) {
        const optimizedUpdates = optimizeRanges(changedCells);
        const batchUpdateRequest = {
            data: optimizedUpdates,
            valueInputOption: "USER_ENTERED",
        };
        callHandler(() => Sheets.Spreadsheets.Values.batchUpdate(batchUpdateRequest, spreadsheetId));
    }
    return {
        rows: filteredRows.length > 0 ? updatedRows : [],
        headers,
    };
}
/**
 * Convert column index to column letter (0 -> A, 1 -> B, etc.)
 */
function getColumnLetter(columnIndex) {
    let columnLetter = "";
    let index = columnIndex;
    while (index >= 0) {
        columnLetter = String.fromCharCode(65 + (index % 26)) + columnLetter;
        index = Math.floor(index / 26) - 1;
    }
    return columnLetter;
}
/**
 * Optimize update ranges by combining adjacent cells in the same column
 * into contiguous row segments.
 */
function optimizeRanges(changedCells) {
    const columnGroups = new Map();
    for (const [cellRange, value] of changedCells.entries()) {
        const matches = cellRange.match(/([^!]+)!([A-Z]+)(\d+)$/);
        if (!matches)
            continue;
        const sheet = matches[1];
        const columnLetter = matches[2];
        const rowNumber = parseInt(matches[3], 10);
        const columnKey = `${sheet}!${columnLetter}`;
        if (!columnGroups.has(columnKey)) {
            columnGroups.set(columnKey, new Map());
        }
        columnGroups.get(columnKey).set(rowNumber, value[0][0]);
    }
    const optimizedUpdates = [];
    for (const [columnKey, rowsMap] of columnGroups.entries()) {
        const rowNumbers = Array.from(rowsMap.keys()).sort((a, b) => a - b);
        if (rowNumbers.length === 0)
            continue;
        const [sheet, column] = columnKey.split("!");
        let start = rowNumbers[0];
        let groupValues = [[rowsMap.get(start)]];
        for (let i = 1; i < rowNumbers.length; i++) {
            const rowNum = rowNumbers[i];
            const prev = rowNumbers[i - 1];
            if (rowNum === prev + 1) {
                groupValues.push([rowsMap.get(rowNum)]);
            }
            else {
                const end = prev;
                const rangeKey = start === end
                    ? `${sheet}!${column}${start}`
                    : `${sheet}!${column}${start}:${column}${end}`;
                optimizedUpdates.push({ range: rangeKey, values: groupValues });
                start = rowNum;
                groupValues = [[rowsMap.get(rowNum)]];
            }
        }
        const last = rowNumbers[rowNumbers.length - 1];
        const rangeKey = start === last
            ? `${sheet}!${column}${start}`
            : `${sheet}!${column}${start}:${column}${last}`;
        optimizedUpdates.push({ range: rangeKey, values: groupValues });
    }
    return optimizedUpdates;
}

function appendInternal(table, data) {
    // Validate input data
    if (!data || data.length === 0) {
        return { rows: [], headers: [] };
    }
    const spreadsheetId = table.spreadsheetId;
    const sheetName = table.sheetName;
    // Fetch headers from the first row
    const response = callHandler(() => Sheets.Spreadsheets.Values.get(spreadsheetId, `${sheetName}!1:1`));
    // Validate sheet exists and has headers
    if (!response || !response.values || response.values.length === 0) {
        throw new Error(`Sheet "${sheetName}" not found or has no headers`);
    }
    const headers = response.values[0].map((header) => String(header));
    // Map data to rows according to header order
    const rowsToAppend = data.map((item) => {
        return headers.map((header) => {
            let value = item[header];
            // Convert Date objects to locale strings
            if (value instanceof Date) {
                value = value.toLocaleString();
            }
            return value !== undefined ? value : "";
        });
    });
    // Append data using Sheets API
    const appendResponse = callHandler(() => Sheets.Spreadsheets.Values.append({ values: rowsToAppend }, spreadsheetId, sheetName, {
        valueInputOption: "USER_ENTERED",
        insertDataOption: "OVERWRITE",
        responseValueRenderOption: "FORMATTED_VALUE",
        responseDateTimeRenderOption: "FORMATTED_STRING",
        includeValuesInResponse: true,
    }));
    // Validate append was successful
    if (!appendResponse ||
        !appendResponse.updates ||
        !appendResponse.updates.updatedRange) {
        throw new Error("Failed to append data to sheet");
    }
    // Parse the updated range to get row numbers
    const updatedRange = appendResponse.updates.updatedRange;
    const rangeMatch = updatedRange.match(/([^!]+)!([A-Z]+)(\d+):([A-Z]+)(\d+)/);
    if (!rangeMatch) {
        throw new Error(`Could not parse updated range: ${updatedRange}`);
    }
    const startRow = parseInt(rangeMatch[3], 10);
    // Create result rows with metadata
    const resultRows = rowsToAppend.map((row, index) => {
        const rowObj = {
            __meta: {
                rowNum: startRow + index,
                colLength: headers.length,
            },
        };
        // Map values to header names
        headers.forEach((header, colIndex) => {
            rowObj[header] = row[colIndex];
        });
        return rowObj;
    });
    return {
        rows: resultRows,
        headers,
    };
}

function deleteInternal(gqueryTableFactory) {
    const spreadsheetId = gqueryTableFactory.gQueryTable.spreadsheetId;
    const sheetName = gqueryTableFactory.gQueryTable.sheetName;
    const sheet = gqueryTableFactory.gQueryTable.sheet;
    const sheetId = sheet.getSheetId();
    const { rows } = fetchSheetData(spreadsheetId, sheetName);
    // Check if filter is specified and rows exist
    if (!gqueryTableFactory.filterOption || rows.length === 0) {
        return { deletedRows: 0 };
    }
    // Find rows matching the filter condition
    const rowsToDelete = rows.filter((row) => {
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
    // Sort in descending order to avoid row number shifting issues
    rowsToDelete.sort((a, b) => b.__meta.rowNum - a.__meta.rowNum);
    // Build batch delete request
    const batchUpdateRequest = {
        requests: rowsToDelete.map((row) => ({
            deleteDimension: {
                range: {
                    sheetId,
                    dimension: "ROWS",
                    startIndex: row.__meta.rowNum - 1, // Convert to 0-based index
                    endIndex: row.__meta.rowNum, // End-exclusive range
                },
            },
        })),
    };
    // Execute batch delete
    try {
        callHandler(() => Sheets.Spreadsheets.batchUpdate(batchUpdateRequest, spreadsheetId));
        return { deletedRows: rowsToDelete.length };
    }
    catch (error) {
        console.error("Error deleting rows:", error);
        throw new Error(`Failed to delete rows: ${error}`);
    }
}

/**
 * Main GQuery class for interacting with Google Sheets
 * Provides a query-like interface for reading and writing spreadsheet data
 */
class GQuery {
    /**
     * Create a new GQuery instance
     * @param spreadsheetId Optional spreadsheet ID. If not provided, uses the active spreadsheet
     */
    constructor(spreadsheetId) {
        this.spreadsheetId = spreadsheetId
            ? spreadsheetId
            : SpreadsheetApp.getActiveSpreadsheet().getId();
    }
    /**
     * Get a table reference for a specific sheet
     * @param sheetName Name of the sheet
     * @returns GQueryTable instance for chaining operations
     */
    from(sheetName) {
        return new GQueryTable(this, this.spreadsheetId, sheetName);
    }
    /**
     * Efficiently fetch data from multiple sheets at once
     * @param sheetNames Array of sheet names to fetch
     * @param options Optional rendering options
     * @returns Object mapping sheet names to their data
     */
    getMany(sheetNames, options) {
        return getManyInternal(this, sheetNames, options);
    }
}
/**
 * Represents a single sheet table for query operations
 */
class GQueryTable {
    constructor(gquery, spreadsheetId, sheetName) {
        this.spreadsheetId = spreadsheetId;
        this.sheetName = sheetName;
        this.spreadsheet = SpreadsheetApp.openById(spreadsheetId);
        this.sheet = this.spreadsheet.getSheetByName(sheetName);
        this.gquery = gquery;
    }
    /**
     * Select specific columns to return
     * @param headers Array of column names to select
     * @returns GQueryTableFactory for chaining
     */
    select(headers) {
        return new GQueryTableFactory(this).select(headers);
    }
    /**
     * Filter rows based on a condition
     * @param filterFn Function that returns true for rows to include
     * @returns GQueryTableFactory for chaining
     */
    where(filterFn) {
        return new GQueryTableFactory(this).where(filterFn);
    }
    /**
     * Join with another sheet
     * @param sheetName Name of sheet to join with
     * @param sheetColumn Column in the joined sheet to match on
     * @param joinColumn Column in this sheet to match on
     * @param columnsToReturn Optional array of columns to return from joined sheet
     * @returns GQueryTableFactory for chaining
     */
    join(sheetName, sheetColumn, joinColumn, columnsToReturn) {
        return new GQueryTableFactory(this).join(sheetName, sheetColumn, joinColumn, columnsToReturn);
    }
    /**
     * Update rows in the sheet
     * @param updateFn Function that receives a row and returns updated values
     * @returns GQueryResult with updated rows
     */
    update(updateFn) {
        return new GQueryTableFactory(this).update(updateFn);
    }
    /**
     * Append new rows to the sheet
     * @param data Single object or array of objects to append
     * @returns GQueryResult with appended rows
     */
    append(data) {
        const dataArray = Array.isArray(data) ? data : [data];
        return appendInternal(this, dataArray);
    }
    /**
     * Get data from the sheet
     * @param options Optional rendering options
     * @returns GQueryResult with rows and headers
     */
    get(options) {
        return new GQueryTableFactory(this).get(options);
    }
    /**
     * Execute a Google Visualization API query
     * @param query Query string in Google Query Language
     * @returns GQueryResult with query results
     */
    query(query) {
        return queryInternal(this, query);
    }
    /**
     * Delete rows from the sheet
     * @returns Object with count of deleted rows
     */
    delete() {
        return new GQueryTableFactory(this).delete();
    }
}
/**
 * Factory class for building and executing queries with filters and joins
 */
class GQueryTableFactory {
    constructor(GQueryTable) {
        this.joinOption = [];
        this.gQueryTable = GQueryTable;
    }
    select(headers) {
        this.selectOption = headers;
        return this;
    }
    where(filterFn) {
        this.filterOption = filterFn;
        return this;
    }
    join(sheetName, sheetColumn, joinColumn, columnsToReturn) {
        this.joinOption.push({
            sheetName,
            sheetColumn,
            joinColumn,
            columnsToReturn,
        });
        return this;
    }
    get(options) {
        return getInternal(this, options);
    }
    update(updateFn) {
        return updateInternal(this, updateFn);
    }
    append(data) {
        const dataArray = Array.isArray(data) ? data : [data];
        return appendInternal(this.gQueryTable, dataArray);
    }
    delete() {
        return deleteInternal(this);
    }
}

export { DateTimeRenderOption, GQuery, GQueryTable, GQueryTableFactory, ValueRenderOption };
//# sourceMappingURL=bundle.js.map
