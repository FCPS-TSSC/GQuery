var GQuery = (function (exports) {
    'use strict';

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

    exports.ValueRenderOption = void 0;
    (function (ValueRenderOption) {
        ValueRenderOption["FORMATTED_VALUE"] = "FORMATTED_VALUE";
        ValueRenderOption["UNFORMATTED_VALUE"] = "UNFORMATTED_VALUE";
        ValueRenderOption["FORMULA"] = "FORMULA";
    })(exports.ValueRenderOption || (exports.ValueRenderOption = {}));
    exports.DateTimeRenderOption = void 0;
    (function (DateTimeRenderOption) {
        DateTimeRenderOption["FORMATTED_STRING"] = "FORMATTED_STRING";
        DateTimeRenderOption["SERIAL_NUMBER"] = "SERIAL_NUMBER";
    })(exports.DateTimeRenderOption || (exports.DateTimeRenderOption = {}));

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
     * Convert raw row data to GQueryRow object with proper typing and metadata
     */
    function mapRowToObject(rowData, headers, rowIndex, applyTypeConversion = true) {
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
            // Apply type conversions if enabled
            if (applyTypeConversion && typeof value === "string" && value !== "") {
                value = convertStringValue(value);
            }
            row[header] = value;
        }
        return row;
    }
    /**
     * Convert string values to appropriate types (boolean, date, etc.)
     */
    function convertStringValue(value) {
        // Auto-detect booleans
        if (value.toLowerCase() === "true" || value.toLowerCase() === "false") {
            return value.toLowerCase() === "true";
        }
        // Auto-detect dates (simple pattern for dates like MM/DD/YYYY, etc.)
        if (/^\d{1,2}\/\d{1,2}\/\d{4}(\s\d{1,2}:\d{1,2}(:\d{1,2})?)?$/.test(value)) {
            try {
                const dateValue = new Date(value);
                if (!isNaN(dateValue.getTime())) {
                    return dateValue;
                }
            }
            catch (e) {
                // Keep as string if conversion fails
            }
        }
        return value;
    }
    /**
     * Normalize value for storage (convert Date objects to strings, etc.)
     */
    function normalizeValueForStorage(value) {
        if (value instanceof Date) {
            return value.toLocaleString();
        }
        return value !== undefined && value !== null ? value : "";
    }
    /**
     * Apply data type conversions based on metadata
     */
    function applyDataTypeConversion(value, dataType) {
        if (!dataType || value === "" || value === null || value === undefined) {
            return value;
        }
        switch (dataType) {
            case "BOOLEAN":
                if (typeof value === "string") {
                    return value.toLowerCase() === "true";
                }
                return Boolean(value);
            case "DATE_TIME":
            case "DATE":
            case "DATETIME":
                try {
                    const dateValue = new Date(value);
                    if (!isNaN(dateValue.getTime())) {
                        return dateValue;
                    }
                }
                catch (e) {
                    // Keep original value if conversion fails
                }
                return value;
            case "NUMBER":
                const numValue = Number(value);
                if (!isNaN(numValue)) {
                    return numValue;
                }
                return value;
            default:
                return value;
        }
    }
    /**
     * Create a lookup table for joins
     */
    function createJoinLookup(joinData, joinColumn) {
        const joinMap = {};
        joinData.forEach((joinRow) => {
            const joinKey = String(joinRow[joinColumn]);
            if (!joinMap[joinKey]) {
                joinMap[joinKey] = [];
            }
            joinMap[joinKey].push(joinRow);
        });
        return joinMap;
    }
    /**
     * Handle errors consistently across the library
     */
    function handleError(operation, error) {
        console.error(`Error in ${operation}:`, error);
    }
    /**
     * Check if two values are equal for comparison purposes
     */
    function valuesEqual(a, b) {
        // Handle Date objects
        if (a instanceof Date && b instanceof Date) {
            return a.getTime() === b.getTime();
        }
        // Handle Date to string comparison
        if (a instanceof Date && typeof b === "string") {
            return a.toLocaleString() === b;
        }
        if (b instanceof Date && typeof a === "string") {
            return b.toLocaleString() === a;
        }
        // Handle null/undefined equivalence with empty string
        if ((a === null || a === undefined || a === "") &&
            (b === null || b === undefined || b === "")) {
            return true;
        }
        return a === b;
    }

    function getManyInternal(gquery, sheetNames, options) {
        if (!sheetNames || sheetNames.length === 0) {
            return {};
        }
        // Set default options if not provided
        const valueRenderOption = (options === null || options === void 0 ? void 0 : options.valueRenderOption) || exports.ValueRenderOption.FORMATTED_VALUE;
        const dateTimeRenderOption = (options === null || options === void 0 ? void 0 : options.dateTimeRenderOption) || exports.DateTimeRenderOption.FORMATTED_STRING;
        const result = {};
        // Optimize: Get data for all sheets in a single batch call including headers
        // This reduces API calls from 2*n to 1 call
        const dataRanges = sheetNames.map((sheet) => `${sheet}`);
        const dataResponse = callHandler(() => Sheets.Spreadsheets.Values.batchGet(gquery.spreadsheetId, {
            ranges: dataRanges,
            valueRenderOption: valueRenderOption,
            dateTimeRenderOption: dateTimeRenderOption,
        }));
        if (!dataResponse || !dataResponse.valueRanges) {
            // Return empty results for all sheets
            sheetNames.forEach((sheet) => {
                result[sheet] = { headers: [], rows: [] };
            });
            return result;
        }
        // Get spreadsheet metadata for data types (single API call)
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
                    // @ts-expect-error: TypeScript may not recognize the tables property
                    if (sheet.tables && sheet.tables.length > 0) {
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
            handleError("fetching metadata", e);
        }
        // Process each value range from the batch response
        dataResponse.valueRanges.forEach((valueRange, index) => {
            const sheetName = sheetNames[index];
            if (!valueRange.values || valueRange.values.length === 0) {
                // Sheet exists but has no data
                result[sheetName] = { headers: [], rows: [] };
                return;
            }
            // Extract headers from first row
            const headers = valueRange.values[0].map((header) => String(header));
            if (valueRange.values.length === 1) {
                // Only headers, no data rows
                result[sheetName] = { headers, rows: [] };
                return;
            }
            const columnTypes = sheetMetadata[sheetName] || {};
            const dataRows = valueRange.values.slice(1);
            // Use the utility function to map rows
            const rows = dataRows.map((rowData, rowIndex) => {
                const row = mapRowToObject(rowData, headers, rowIndex, true);
                // Apply metadata-based type conversions
                if (Object.keys(columnTypes).length > 0) {
                    headers.forEach((header) => {
                        if (columnTypes[header] && row[header] !== "") {
                            row[header] = applyDataTypeConversion(row[header], columnTypes[header]);
                        }
                    });
                }
                return row;
            });
            result[sheetName] = { headers, rows };
        });
        // Ensure all requested sheets have an entry in result
        sheetNames.forEach((sheet) => {
            if (!result[sheet]) {
                result[sheet] = { headers: [], rows: [] };
            }
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
                // Create join lookup table using utility function
                const joinMap = createJoinLookup(joinData.rows, sheetColumn);
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
        try {
            var jsonResponse = JSON.parse(response
                .getContentText()
                .replace("/*O_o*/\n", "")
                .replace(/(google\.visualization\.Query\.setResponse\()|(\);)/gm, "")), table = jsonResponse.table;
        }
        catch (e) {
            handleError("parsing query response", e);
            return { headers: [], rows: [] };
        }
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
        // Get table configuration
        const spreadsheetId = gQueryTableFactory.gQueryTable.spreadsheetId;
        const sheetName = gQueryTableFactory.gQueryTable.sheetName;
        const range = sheetName;
        // Fetch current data from the sheet
        const response = callHandler(() => Sheets.Spreadsheets.Values.get(spreadsheetId, range));
        const values = response.values || [];
        if (values.length === 0) {
            return { rows: [], headers: [] };
        }
        // Extract headers and rows
        const headers = values[0];
        const rows = values.slice(1).map((row, index) => mapRowToObject(row, headers, index, false));
        // Filter rows if where function is provided
        let filteredRows = [];
        if (gQueryTableFactory.filterOption) {
            try {
                filteredRows = rows.filter((row) => {
                    try {
                        return gQueryTableFactory.filterOption(row);
                    }
                    catch (error) {
                        handleError("filtering row", error);
                        return false;
                    }
                });
            }
            catch (error) {
                handleError("filter function", error);
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
                handleError("updating row", error);
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
                let updatedValue = normalizeValueForStorage(updatedRow[header]);
                let originalValue = normalizeValueForStorage(originalRow[header]);
                // Skip if values are the same
                if (valuesEqual(originalValue, updatedValue))
                    return;
                // Only update if we have a meaningful value OR if we explicitly want to clear a cell
                // This prevents overwriting existing data with empty values unless intentional
                if (updatedValue !== undefined &&
                    updatedValue !== null &&
                    updatedValue !== "") {
                    // Use A1 notation for the column (A, B, C, etc.)
                    const columnLetter = getColumnLetter(columnIndex);
                    const cellRange = `${sheetName}!${columnLetter}${updatedRow.__meta.rowNum}`;
                    // Store the change
                    changedCells.set(cellRange, [[updatedValue]]);
                }
                else if ((originalValue === "" || originalValue === undefined || originalValue === null) &&
                    (updatedValue === "" || updatedValue === undefined || updatedValue === null)) {
                    // Only clear the cell if the original was already empty and we explicitly want to set it to empty
                    const columnLetter = getColumnLetter(columnIndex);
                    const cellRange = `${sheetName}!${columnLetter}${updatedRow.__meta.rowNum}`;
                    changedCells.set(cellRange, [[updatedValue || ""]]);
                }
                // If updatedValue is empty but original had content, we skip the update to preserve existing data
            });
        });
        // Only update if we have changes
        if (changedCells.size > 0) {
            // Create individual cell updates instead of range optimization
            // to prevent overwriting existing data in non-modified cells
            const batchUpdateRequest = {
                data: [],
                valueInputOption: "USER_ENTERED",
            };
            // Add each individual cell update to the batch request
            for (const [cellRange, value] of changedCells.entries()) {
                batchUpdateRequest.data.push({
                    range: cellRange,
                    values: value,
                });
            }
            // Send a single batch update to Google Sheets
            callHandler(() => Sheets.Spreadsheets.Values.batchUpdate(batchUpdateRequest, spreadsheetId));
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
                const value = normalizeValueForStorage(item[header]);
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
        // Fetch current data from the sheet
        const response = callHandler(() => Sheets.Spreadsheets.Values.get(spreadsheetId, sheetName));
        const values = response.values || [];
        if (values.length <= 1) {
            // Only header row or empty sheet
            return { deletedRows: 0 };
        }
        // Extract headers and rows using shared utility
        const headers = values[0];
        const rows = values.slice(1).map((row, rowIndex) => mapRowToObject(row, headers, rowIndex, false));
        // If no filter option, nothing to delete
        if (!gqueryTableFactory.filterOption || rows.length === 0) {
            return { deletedRows: 0 };
        }
        // Find rows matching the filter condition (these will be deleted)
        const rowsToDelete = rows.filter((row) => {
            try {
                return gqueryTableFactory.filterOption(row);
            }
            catch (error) {
                handleError("filtering row for deletion", error);
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
            handleError("deleting rows", error);
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

    exports.GQuery = GQuery;
    exports.GQueryTable = GQueryTable;
    exports.GQueryTableFactory = GQueryTableFactory;

    return exports;

})({});
//# sourceMappingURL=bundle.global.js.map
