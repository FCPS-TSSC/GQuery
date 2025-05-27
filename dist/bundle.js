function getManyInternal(gquery, sheetNames, options) {
    if (!sheetNames || sheetNames.length === 0) {
        return {};
    }
    // Set default options if not provided
    const valueRenderOption = (options === null || options === void 0 ? void 0 : options.valueRenderOption) || ValueRenderOption.FORMATTED_VALUE;
    const dateTimeRenderOption = (options === null || options === void 0 ? void 0 : options.dateTimeRenderOption) || DateTimeRenderOption.FORMATTED_STRING;
    const result = {};
    const headersMap = {};
    // Step 1: Get headers for each sheet (row 1)
    for (const sheetName of sheetNames) {
        try {
            const headerResponse = Sheets.Spreadsheets.Values.get(gquery.spreadsheetId, `${sheetName}!1:1`, {
                valueRenderOption: valueRenderOption,
                dateTimeRenderOption: dateTimeRenderOption,
            });
            if (!headerResponse ||
                !headerResponse.values ||
                headerResponse.values.length === 0) {
                // Handle empty sheet or sheet with no headers
                result[sheetName] = { headers: [], rows: [] };
                continue;
            }
            headersMap[sheetName] = headerResponse.values[0].map((header) => String(header));
        }
        catch (e) {
            console.error(`Error fetching headers for sheet ${sheetName}:`, e);
            result[sheetName] = { headers: [], rows: [] };
        }
    }
    // Step 2: Get data for sheets that have headers
    const sheetsToFetch = Object.keys(headersMap).filter((sheet) => headersMap[sheet].length > 0);
    if (sheetsToFetch.length === 0) {
        return result;
    }
    // Also fetch metadata for each sheet to determine data types
    let sheetMetadata = {};
    try {
        // Get spreadsheet metadata including sheet tables if available
        const metadataResponse = Sheets.Spreadsheets.get(gquery.spreadsheetId, {
            fields: "sheets(properties(title),tables.columnProperties)",
        });
        if (metadataResponse && metadataResponse.sheets) {
            metadataResponse.sheets.forEach((sheet) => {
                var _a;
                const sheetName = (_a = sheet.properties) === null || _a === void 0 ? void 0 : _a.title;
                if (!sheetName || !sheetsToFetch.includes(sheetName))
                    return;
                // @ts-expect-error: TypeScript may not recognize the tables property
                if (sheet.tables && sheet.tables.length > 0) {
                    // Use the first table definition for column properties
                    // @ts-expect-error: TypeScript may not recognize the tables property
                    const table = sheet.tables[0];
                    if (table.columnProperties) {
                        sheetMetadata[sheetName] = {};
                        // For each column property, store its data type
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
        // Continue without metadata - types won't be converted
    }
    // Batch get data for all sheets (just use the sheet name as the range)
    const dataRanges = sheetsToFetch.map((sheet) => `${sheet}`);
    const dataResponse = Sheets.Spreadsheets.Values.batchGet(gquery.spreadsheetId, {
        ranges: dataRanges,
        valueRenderOption: valueRenderOption,
        dateTimeRenderOption: dateTimeRenderOption,
    });
    if (!dataResponse || !dataResponse.valueRanges) {
        // Return just the headers if we couldn't get any data
        sheetsToFetch.forEach((sheet) => {
            result[sheet] = {
                headers: headersMap[sheet],
                rows: [],
            };
        });
        return result;
    }
    // Process each value range from the batch response
    dataResponse.valueRanges.forEach((valueRange, index) => {
        const sheetName = sheetsToFetch[index];
        const headers = headersMap[sheetName];
        if (!valueRange.values || valueRange.values.length === 0) {
            // Sheet exists but has no data rows
            result[sheetName] = { headers, rows: [] };
            return;
        }
        const rows = [];
        const columnTypes = sheetMetadata[sheetName] || {};
        // Process data rows
        valueRange.values.forEach((rowData, rowIndex) => {
            const row = {
                __meta: {
                    rowNum: rowIndex + 2, // +2 because we're starting from index 0 and row 1 is headers
                    colLength: rowData.length,
                },
            };
            // First initialize all header fields to empty strings
            headers.forEach((header) => {
                row[header] = "";
            });
            // Map each column value to its corresponding header
            for (let j = 0; j < Math.min(rowData.length, headers.length); j++) {
                const header = headers[j];
                let value = rowData[j];
                if (value === null || value === undefined) {
                    continue; // Skip processing but keep the empty string initialized earlier
                }
                // Apply type conversions based on metadata if available
                if (columnTypes[header] && value !== "") {
                    const dataType = columnTypes[header];
                    if (dataType === "BOOLEAN") {
                        // Convert to boolean
                        if (typeof value === "string") {
                            value = value.toLowerCase() === "true";
                        }
                    }
                    else if (dataType === "DATE_TIME") {
                        // Convert to Date object
                        try {
                            const dateValue = new Date(value);
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
                        const numValue = Number(value);
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
                }
                row[header] = value;
            }
            rows.push(row);
        });
        result[sheetName] = { headers, rows };
    });
    // Make sure all sheets in headersMap have an entry in result
    sheetsToFetch.forEach((sheet) => {
        if (!result[sheet]) {
            result[sheet] = {
                headers: headersMap[sheet],
                rows: [],
            };
        }
    });
    // Convert data types based on metadata if available
    if (Object.keys(sheetMetadata).length > 0) {
        Object.keys(result).forEach((sheetName) => {
            const sheetResult = result[sheetName];
            const metadata = sheetMetadata[sheetName];
            if (sheetResult && sheetResult.rows && metadata) {
                sheetResult.rows = sheetResult.rows.map((row) => {
                    const newRow = Object.assign({}, row);
                    Object.keys(metadata).forEach((column) => {
                        const dataType = metadata[column];
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

function updateInternal(gQueryTableFactory, updateFn) {
    // Get table configuration
    const spreadsheetId = gQueryTableFactory.gQueryTable.spreadsheetId;
    const sheetName = gQueryTableFactory.gQueryTable.sheetName;
    const range = sheetName;
    // Fetch current data from the sheet
    const response = Sheets.Spreadsheets.Values.get(spreadsheetId, range);
    const values = response.values || [];
    if (values.length === 0) {
        return { rows: [], headers: [] };
    }
    // Extract headers and rows
    const headers = values[0];
    const rows = values.slice(1).map((row) => {
        const obj = {};
        headers.forEach((header, i) => {
            // Ensure all properties are initialized, even if empty
            obj[header] = row[i] !== undefined ? row[i] : "";
        });
        return obj;
    });
    // Filter rows if where function is provided
    let filteredRows = [];
    if (gQueryTableFactory.filterOption) {
        try {
            filteredRows = rows.filter((row) => {
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
            return { rows: [], headers };
        }
    }
    else {
        filteredRows = rows;
    }
    // Update filtered rows
    const updatedRows = filteredRows.map((row) => {
        // Apply the update function to get the updated row values
        const updatedRow = Object.assign({}, row);
        try {
            const result = updateFn(updatedRow);
            // Handle both return value updates and direct modifications
            Object.assign(updatedRow, result);
        }
        catch (error) {
            console.error("Error updating row:", error);
        }
        // Find the index of this row in the original data array
        const rowIndex = rows.findIndex((origRow) => Object.keys(origRow).every((key) => origRow[key] === row[key]));
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
    const changedCells = new Map();
    // For each updated row, determine which cells changed
    updatedRows.forEach((updatedRow) => {
        if (!updatedRow.__meta)
            return;
        const rowIndex = updatedRow.__meta.rowNum - 2;
        const originalRow = rows[rowIndex];
        headers.forEach((header, columnIndex) => {
            // Skip if values are the same
            if (originalRow[header] === updatedRow[header])
                return;
            // Use A1 notation for the column (A, B, C, etc.)
            const columnLetter = getColumnLetter(columnIndex);
            const cellRange = `${sheetName}!${columnLetter}${updatedRow.__meta.rowNum}`;
            // Store the change
            changedCells.set(cellRange, [[updatedRow[header] || ""]]);
        });
    });
    // Only update if we have changes
    if (changedCells.size > 0) {
        // Group adjacent cells in the same column for more efficient updates
        const optimizedUpdates = optimizeRanges(changedCells);
        // Send updates to Google Sheets
        for (const [range, values] of Object.entries(optimizedUpdates)) {
            Sheets.Spreadsheets.Values.update({ values }, spreadsheetId, range, {
                valueInputOption: "USER_ENTERED",
            });
        }
    }
    // If updates were made, properly return the filtered and updated rows
    // Make a fresh copy of the returned rows to ensure they have proper structure
    const resultRows = filteredRows.length > 0
        ? updatedRows.map((row) => {
            const resultRow = { __meta: row.__meta };
            headers.forEach((header) => {
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
 */
function optimizeRanges(changedCells) {
    // Group cells by column
    const columnGroups = new Map();
    for (const [cellRange, value] of changedCells.entries()) {
        // Extract column letter and row number from A1 notation
        const matches = cellRange.match(/([^!]+)!([A-Z]+)(\d+)$/);
        if (!matches)
            continue;
        const sheet = matches[1];
        const columnLetter = matches[2];
        const rowNumber = parseInt(matches[3]);
        const columnKey = `${sheet}!${columnLetter}`;
        if (!columnGroups.has(columnKey)) {
            columnGroups.set(columnKey, new Map());
        }
        columnGroups.get(columnKey).set(rowNumber, value[0][0]);
    }
    // Create optimized ranges
    const optimizedUpdates = {};
    for (const [columnKey, rowsMap] of columnGroups.entries()) {
        // Sort row numbers
        const rowNumbers = Array.from(rowsMap.keys()).sort((a, b) => a - b);
        if (rowNumbers.length === 0)
            continue;
        // Instead of finding continuous ranges, just find min and max to create one range per column
        const minRow = Math.min(...rowNumbers);
        const maxRow = Math.max(...rowNumbers);
        // Extract sheet name and column from columnKey
        const sheet = columnKey.split("!")[0];
        const column = columnKey.split("!")[1];
        // Create a single range from min to max row
        const rangeKey = `${sheet}!${column}${minRow}:${column}${maxRow}`;
        // Create array of values with proper ordering
        const values = [];
        for (let row = minRow; row <= maxRow; row++) {
            // Use the updated value if it exists, otherwise use empty string to preserve the existing value
            const value = rowsMap.has(row) ? rowsMap.get(row) : "";
            values.push([value]);
        }
        optimizedUpdates[rangeKey] = values;
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
    const response = Sheets.Spreadsheets.Values.get(spreadsheetId, `${sheetName}!1:1`);
    // If sheet is empty or doesn't exist, cannot append
    if (!response || !response.values || response.values.length === 0) {
        throw new Error(`Sheet "${sheetName}" not found or has no headers`);
    }
    const headers = response.values[0].map((header) => String(header));
    // Format data to be appended according to the sheet's headers
    const rowsToAppend = data.map((item) => {
        // For each header, get corresponding value from item or empty string
        return headers.map((header) => {
            return item[header] !== undefined ? item[header] : "";
        });
    });
    // Use Sheets API to append the data
    const appendResponse = Sheets.Spreadsheets.Values.append({ values: rowsToAppend }, spreadsheetId, `${sheetName}`, {
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        responseValueRenderOption: "FORMATTED_VALUE",
        responseDateTimeRenderOption: "FORMATTED_STRING",
        includeValuesInResponse: true,
    });
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
    read(options) {
        return new GQueryTableFactory(this).get(options);
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

export { DateTimeRenderOption, GQuery, GQueryTable, GQueryTableFactory, ValueRenderOption };
//# sourceMappingURL=bundle.js.map
