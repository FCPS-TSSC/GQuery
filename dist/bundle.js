function callHandler(fn, retries = 16) {
    let attempt = 0;
    while (attempt < retries) {
        try {
            return fn();
        }
        catch (error) {
            if (error.message.includes("429") ||
                error.message.includes("Quota exceeded for quota metric")) {
                attempt++;
                const backoffDelay = Math.min(Math.pow(2, attempt) + Math.random() * 1000, 64000);
                Utilities.sleep(backoffDelay);
            }
            else {
                throw error; // Rethrow if it's not a rate limit error
            }
        }
    }
    throw new Error("Max retries reached for Google Sheets API call.");
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

function parseRows(headers, values) {
    return values.map((row, rowIndex) => {
        const obj = {
            __meta: {
                rowNum: rowIndex + 2, // +2 because header row is 1
                colLength: headers.length,
            },
        };
        headers.forEach((header, i) => {
            obj[header] = row[i] !== undefined ? row[i] : "";
        });
        return obj;
    });
}
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

function getManyInternal(gquery, sheetNames, options) {
    if (!sheetNames || sheetNames.length === 0) {
        return {};
    }
    const valueRenderOption = (options === null || options === void 0 ? void 0 : options.valueRenderOption) || ValueRenderOption.FORMATTED_VALUE;
    const dateTimeRenderOption = (options === null || options === void 0 ? void 0 : options.dateTimeRenderOption) || DateTimeRenderOption.FORMATTED_STRING;
    const result = {};
    let sheetMetadata = {};
    try {
        const metadataResponse = callHandler(() => Sheets.Spreadsheets.get(gquery.spreadsheetId, {
            fields: "sheets(properties(title),tables.columnProperties)",
        }));
        if (metadataResponse && metadataResponse.sheets) {
            metadataResponse.sheets.forEach((sheet) => {
                var _a;
                const sheetName = (_a = sheet.properties) === null || _a === void 0 ? void 0 : _a.title;
                if (!sheetName || !sheetNames.includes(sheetName))
                    return;
                // @ts-expect-error: tables may not be typed
                if (sheet.tables && sheet.tables.length > 0) {
                    // @ts-expect-error
                    const table = sheet.tables[0];
                    if (table.columnProperties) {
                        sheetMetadata[sheetName] = {};
                        Object.keys(table.columnProperties).forEach((column) => {
                            const dataType = table.columnProperties[column].dataType;
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
    }
    const dataResponse = callHandler(() => Sheets.Spreadsheets.Values.batchGet(gquery.spreadsheetId, {
        ranges: sheetNames.map((s) => `${s}`),
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
        const columnTypes = sheetMetadata[sheetName] || {};
        rows = rows.map((row) => {
            const newRow = { __meta: row.__meta };
            headers.forEach((header) => {
                let value = row[header];
                if (value !== undefined && value !== null && value !== "") {
                    if (columnTypes[header]) {
                        const dataType = columnTypes[header];
                        if (dataType === "BOOLEAN") {
                            if (typeof value === "string") {
                                value = value.toLowerCase() === "true";
                            }
                        }
                        else if (dataType === "DATE_TIME") {
                            const dateValue = new Date(value);
                            if (!isNaN(dateValue.getTime())) {
                                value = dateValue;
                            }
                        }
                        else if (dataType === "NUMBER") {
                            const numValue = Number(value);
                            if (!isNaN(numValue)) {
                                value = numValue;
                            }
                        }
                    }
                    else if (typeof value === "string") {
                        if (value.toLowerCase() === "true" ||
                            value.toLowerCase() === "false") {
                            value = value.toLowerCase() === "true";
                        }
                        else if (/^\d{1,2}\/\d{1,2}\/\d{4}(\s\d{1,2}:\d{1,2}(:\d{1,2})?)?$/.test(value)) {
                            const dateValue = new Date(value);
                            if (!isNaN(dateValue.getTime())) {
                                value = dateValue;
                            }
                        }
                    }
                }
                newRow[header] = value;
            });
            return newRow;
        });
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
    const headers = table.cols.map((col) => col.label);
    // Map rows to proper GQueryRow format
    const rows = table.rows.map((row, _rowIndex) => {
        const rowObj = {
            __meta: {
                rowNum: -1, // +2 because we're starting from index 0 and row 1 is headers
                colLength: row.c.length,
            },
        };
        // Initialize all header fields to empty strings
        headers.forEach((header) => {
            rowObj[header] = "";
        });
        // Populate row data
        table.cols.forEach((col, colIndex) => {
            const cellData = row.c[colIndex];
            if (cellData) {
                // Use formatted value if available, otherwise use raw value
                let value = cellData.f !== null && cellData.f !== undefined
                    ? cellData.f
                    : cellData.v;
                // Convert known data types
                if (value instanceof Date) ;
                else if (typeof value === "string") {
                    // Try to auto-detect date strings
                    if (/^\d{1,2}\/\d{1,2}\/\d{4}(\s\d{1,2}:\d{1,2}(:\d{1,2})?)?$/.test(value)) {
                        try {
                            const dateValue = new Date(value);
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

function updateInternal(gQueryTableFactory, updateFn) {
    const spreadsheetId = gQueryTableFactory.gQueryTable.spreadsheetId;
    const sheetName = gQueryTableFactory.gQueryTable.sheetName;
    const range = sheetName;
    const { headers, rows } = fetchSheetData(spreadsheetId, range);
    if (headers.length === 0) {
        return { rows: [], headers: [] };
    }
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
    const updatedRows = filteredRows.map((row) => {
        const updatedRow = Object.assign({}, row);
        try {
            // Allow the updateFn to mutate the provided row object directly or
            // return a partial set of properties to merge.
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
    const changedCells = new Map();
    updatedRows.forEach((updatedRow) => {
        const rowIndex = updatedRow.__meta.rowNum - 2;
        const originalRow = rows[rowIndex];
        headers.forEach((header, columnIndex) => {
            let updatedValue = updatedRow[header];
            if (updatedValue instanceof Date) {
                updatedValue = updatedValue.toLocaleString();
            }
            if (originalRow[header] === updatedValue)
                return;
            if (updatedValue !== undefined && updatedValue !== null) {
                const columnLetter = getColumnLetter(columnIndex);
                const cellRange = `${sheetName}!${columnLetter}${updatedRow.__meta.rowNum}`;
                changedCells.set(cellRange, [[updatedValue]]);
            }
            else if (originalRow[header] === undefined ||
                originalRow[header] === null) {
                const columnLetter = getColumnLetter(columnIndex);
                const cellRange = `${sheetName}!${columnLetter}${updatedRow.__meta.rowNum}`;
                changedCells.set(cellRange, [[updatedValue || ""]]);
            }
        });
    });
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
    // If no data is provided or empty array, return empty result
    if (!data || data.length === 0) {
        return { rows: [], headers: [] };
    }
    // Extract spreadsheet information
    const spreadsheetId = table.spreadsheetId;
    const sheetName = table.sheetName;
    // First, get the current headers from the sheet
    const response = callHandler(() => Sheets.Spreadsheets.Values.get(spreadsheetId, `${sheetName}!1:1`));
    // If sheet is empty or doesn't exist, cannot append
    if (!response || !response.values || response.values.length === 0) {
        throw new Error(`Sheet "${sheetName}" not found or has no headers`);
    }
    const headers = response.values[0].map((header) => String(header));
    // Format data to be appended according to the sheet's headers
    const rowsToAppend = data.map((item) => {
        // For each header, get corresponding value from item or empty string
        return headers.map((header) => {
            let value = item[header];
            // Convert Date objects to strings
            if (value instanceof Date) {
                value = value.toLocaleString();
            }
            return value !== undefined ? value : "";
        });
    });
    // Use Sheets API to append the data
    const appendResponse = callHandler(() => Sheets.Spreadsheets.Values.append({ values: rowsToAppend }, spreadsheetId, `${sheetName}`, {
        valueInputOption: "USER_ENTERED",
        insertDataOption: "OVERWRITE",
        responseValueRenderOption: "FORMATTED_VALUE",
        responseDateTimeRenderOption: "FORMATTED_STRING",
        includeValuesInResponse: true,
    }));
    // Check if append was successful
    if (!appendResponse ||
        !appendResponse.updates ||
        !appendResponse.updates.updatedRange) {
        throw new Error("Failed to append data to sheet");
    }
    // Extract information about the appended rows
    const updatedRange = appendResponse.updates.updatedRange;
    const rangeMatch = updatedRange.match(/([^!]+)!([A-Z]+)(\d+):([A-Z]+)(\d+)/);
    if (!rangeMatch) {
        throw new Error(`Could not parse updated range: ${updatedRange}`);
    }
    // Get start and end row numbers from the updated range
    const startRow = parseInt(rangeMatch[3]);
    parseInt(rangeMatch[5]);
    // Create result rows with metadata
    const resultRows = rowsToAppend.map((row, index) => {
        const rowObj = {
            __meta: {
                rowNum: startRow + index,
                colLength: headers.length,
            },
        };
        // Add data according to headers
        headers.forEach((header, colIndex) => {
            rowObj[header] = row[colIndex];
        });
        return rowObj;
    });
    return {
        rows: resultRows,
        headers: headers,
    };
}

function deleteInternal(gqueryTableFactory) {
    // Get table configuration
    const spreadsheetId = gqueryTableFactory.gQueryTable.spreadsheetId;
    const sheetName = gqueryTableFactory.gQueryTable.sheetName;
    const sheet = gqueryTableFactory.gQueryTable.sheet;
    const sheetId = sheet.getSheetId();
    const { rows } = fetchSheetData(spreadsheetId, sheetName);
    if (!gqueryTableFactory.filterOption || rows.length === 0) {
        return { deletedRows: 0 };
    }
    // Find rows matching the filter condition (these will be deleted)
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
    // Sort rowsToDelete by row number in descending order to avoid shifting issues
    rowsToDelete.sort((a, b) => b.__meta.rowNum - a.__meta.rowNum);
    // Create an array of row indices to delete
    const rowIndicesToDelete = rowsToDelete.map((row) => row.__meta.rowNum);
    // Create batch update request for deleting the rows
    const batchUpdateRequest = {
        requests: rowIndicesToDelete.map((rowIndex) => ({
            deleteDimension: {
                range: {
                    sheetId: sheetId,
                    dimension: "ROWS",
                    startIndex: rowIndex - 1, // Convert to 0-based index
                    endIndex: rowIndex, // Range is end-exclusive
                },
            },
        })),
    };
    // Execute the batch update
    try {
        callHandler(() => Sheets.Spreadsheets.batchUpdate(batchUpdateRequest, spreadsheetId));
    }
    catch (error) {
        console.error("Error deleting rows:", error);
        return { deletedRows: 0 };
    }
    return { deletedRows: rowsToDelete.length };
}

class GQuery {
    constructor(spreadsheetId) {
        this.spreadsheetId = spreadsheetId
            ? spreadsheetId
            : SpreadsheetApp.getActiveSpreadsheet().getId();
    }
    from(sheetName) {
        return new GQueryTable(this, this.spreadsheetId, sheetName);
    }
    getMany(sheetNames, options) {
        return getManyInternal(this, sheetNames, options);
    }
}
class GQueryTable {
    constructor(gquery, spreadsheetId, sheetName) {
        this.spreadsheetId = spreadsheetId;
        this.sheetName = sheetName;
        this.spreadsheet = SpreadsheetApp.openById(spreadsheetId);
        this.sheet = this.spreadsheet.getSheetByName(sheetName);
        this.gquery = gquery;
    }
    select(headers) {
        return new GQueryTableFactory(this).select(headers);
    }
    where(filterFn) {
        return new GQueryTableFactory(this).where(filterFn);
    }
    join(sheetName, sheetColumn, joinColumn, columnsToReturn) {
        return new GQueryTableFactory(this).join(sheetName, sheetColumn, joinColumn, columnsToReturn);
    }
    update(updateFn) {
        return new GQueryTableFactory(this).update(updateFn);
    }
    append(data) {
        // Handle single object by wrapping it in an array
        const dataArray = Array.isArray(data) ? data : [data];
        return appendInternal(this, dataArray);
    }
    get(options) {
        return new GQueryTableFactory(this).get(options);
    }
    query(query) {
        return queryInternal(this, query);
    }
    delete() {
        return new GQueryTableFactory(this).delete();
    }
}
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
        // Handle single object by wrapping it in an array
        const dataArray = Array.isArray(data) ? data : [data];
        return appendInternal(this.gQueryTable, dataArray);
    }
    delete() {
        return deleteInternal(this);
    }
}

export { DateTimeRenderOption, GQuery, GQueryTable, GQueryTableFactory, ValueRenderOption };
//# sourceMappingURL=bundle.js.map
