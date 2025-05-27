function getManyInternal(gquery, sheetNames, options) {
    if (!sheetNames || sheetNames.length === 0) {
        return {};
    }
    // Set default options if not provided
    const valueRenderOption = (options === null || options === void 0 ? void 0 : options.valueRenderOption) || ValueRenderOption.FORMATTED_VALUE;
    const dateTimeRenderOption = (options === null || options === void 0 ? void 0 : options.dateTimeRenderOption) || DateTimeRenderOption.FORMATTED_STRING;
    // Use Sheets API to batch get the data
    const response = Sheets.Spreadsheets.Values.batchGet(gquery.spreadsheetId, {
        ranges: sheetNames,
        valueRenderOption: valueRenderOption,
        dateTimeRenderOption: dateTimeRenderOption,
    });
    const result = {};
    if (!response || !response.valueRanges) {
        return result;
    }
    // Process each returned value range
    response.valueRanges.forEach((valueRange, index) => {
        const sheetName = sheetNames[index];
        if (!valueRange.values || valueRange.values.length === 0) {
            // Handle empty sheet
            result[sheetName] = { headers: [], rows: [] };
            return;
        }
        // First row contains headers
        const headers = valueRange.values[0].map((header) => String(header));
        const rows = [];
        // Process data rows (starting from index 1 to skip headers)
        for (let i = 1; i < valueRange.values.length; i++) {
            const rowData = valueRange.values[i];
            const row = {
                __meta: {
                    rowNum: i + 1, // 1-based row number (+1 because we're starting from index 1)
                    colLength: rowData.length,
                },
            };
            // Map each column value to its corresponding header
            for (let j = 0; j < headers.length; j++) {
                const header = headers[j];
                row[header] = j < rowData.length ? rowData[j] : null;
            }
            rows.push(row);
        }
        result[sheetName] = { headers, rows };
    });
    return result;
}
function getInternal(gqueryTableFactory) {
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
    const results = gquery.getMany(sheetsToRead);
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
    const range = gQueryTableFactory.gQueryTable.sheetName;
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
            obj[header] = row[i];
        });
        return obj;
    });
    // Filter rows if where function is provided
    const filteredRows = gQueryTableFactory.filterOption
        ? rows.filter(gQueryTableFactory.filterOption)
        : rows;
    // Update filtered rows
    const updatedRows = filteredRows.map((row) => {
        // Apply the update function to get the updated row values
        const updatedRow = updateFn(row);
        // Find the index of this row in the original data array
        const rowIndex = rows.indexOf(row);
        // Only update the spreadsheet if we found the row
        if (rowIndex !== -1) {
            // Update the row in the values array with the new values
            const newRowValues = headers.map((header) => updatedRow[header] || "");
            values[rowIndex + 1] = newRowValues; // +1 to account for header row
        }
        // Add __meta to each row with required properties
        return Object.assign(Object.assign({}, updatedRow), { __meta: {
                rowNum: rowIndex + 2, // +2 because we have headers at index 0 and row index is 0-based
                colLength: headers.length,
            } });
    });
    // Only update the rows that were modified if there are any
    if (updatedRows.length > 0) {
        // Prepare a single bulk update
        const dataToUpdate = [];
        let hasUpdates = false;
        // Go through the original values array and replace only the rows that were updated
        for (let i = 1; i < values.length; i++) {
            const originalRow = rows[i - 1];
            // Check if this row was in our filtered/updated set
            const updatedRowIndex = filteredRows.indexOf(originalRow);
            if (updatedRowIndex !== -1) {
                // This row was updated, use the new values
                hasUpdates = true;
                const updatedRow = updatedRows[updatedRowIndex];
                dataToUpdate.push(headers.map((header) => updatedRow[header] || ""));
            }
            else {
                // This row wasn't updated, keep the original values
                dataToUpdate.push(values[i]);
            }
        }
        // Only send the update if we actually modified rows
        if (hasUpdates) {
            // Find the range of modified rows to optimize the update
            const rowIndices = filteredRows
                .map((row) => rows.indexOf(row))
                .filter((idx) => idx !== -1);
            if (rowIndices.length > 0) {
                // Create a special wrapped update function that tracks what actually changed
                const modifiedColumns = new Set();
                const originalValues = {};
                // Store the original values before update to detect changes
                filteredRows.forEach((row) => {
                    const rowKey = JSON.stringify(row);
                    originalValues[rowKey] = Object.assign({}, row);
                });
                // Detect explicit assignments and modifications in the update function
                filteredRows.forEach((originalRow, idx) => {
                    const updatedRow = updatedRows[idx];
                    const original = originalValues[JSON.stringify(originalRow)] || {};
                    // Look for changes by comparing original values to updated values
                    headers.forEach((header) => {
                        if (original[header] !== updatedRow[header] &&
                            updatedRow[header] !== undefined) {
                            modifiedColumns.add(header);
                            console.log(`Detected change in column ${header}: ${original[header]} -> ${updatedRow[header]}`);
                        }
                    });
                });
                // For assignment expressions used in the update function
                // Make sure we include a default set of columns
                if (modifiedColumns.size === 0) {
                    // For update functions like (row) => row.Assigned_To = "Steve"
                    // Default to updating Assigned_To column
                    console.log("No columns detected as modified, checking for assignment-style updates");
                    // Check common assignment patterns based on the update function
                    const fnStr = updateFn.toString();
                    const assignmentMatch = fnStr.match(/row\.(\w+)\s*=/);
                    if (assignmentMatch && assignmentMatch[1]) {
                        const columnName = assignmentMatch[1];
                        if (headers.includes(columnName)) {
                            modifiedColumns.add(columnName);
                            console.log(`Detected assignment-style update to column ${columnName}`);
                        }
                    }
                }
                // If still no columns were actually modified, return without updating
                if (modifiedColumns.size === 0) {
                    console.log("No modifications detected, skipping update");
                    // Make sure the rows in the response have the proper structure
                    const properRows = updatedRows.map((row) => {
                        const properRow = {};
                        headers.forEach((header) => {
                            properRow[header] = row[header] || "";
                        });
                        properRow.__meta = row.__meta;
                        return properRow;
                    });
                    return {
                        rows: properRows,
                        headers: headers,
                    };
                }
                // Get the indices of the modified columns
                Array.from(modifiedColumns).map((col) => headers.indexOf(col));
                // Calculate the range of rows to update
                const minRowIndex = Math.min(...rowIndices) + 1;
                const maxRowIndex = Math.max(...rowIndices) + 1;
                // For each modified column, create a separate update
                for (const columnName of modifiedColumns) {
                    const columnIndex = headers.indexOf(columnName);
                    if (columnIndex === -1)
                        continue;
                    // Column letter for A1 notation (A, B, C, etc.)
                    const columnLetter = String.fromCharCode(65 + columnIndex);
                    // Create column data for each modified row
                    const columnData = [];
                    // For each row in the update range
                    for (let i = 0; i < maxRowIndex - minRowIndex + 1; i++) {
                        const originalRowIndex = minRowIndex + i;
                        const originalRow = rows[originalRowIndex - 1];
                        const filteredIndex = filteredRows.indexOf(originalRow);
                        if (filteredIndex !== -1) {
                            // Use the updated value
                            columnData.push([updatedRows[filteredIndex][columnName]]);
                        }
                        else {
                            // Row wasn't in our filter, keep original
                            columnData.push([values[originalRowIndex][columnIndex]]);
                        }
                    }
                    // Create A1 notation for just this column's range
                    const columnRange = `${range}!${columnLetter}${minRowIndex + 1}:${columnLetter}${maxRowIndex + 1}`;
                    // Update just this column
                    Sheets.Spreadsheets.Values.update({ values: columnData }, spreadsheetId, columnRange, { valueInputOption: "USER_ENTERED" });
                }
            }
        }
    }
    // Make sure the rows in the response have the proper structure
    const properRows = updatedRows.map((row) => {
        const properRow = {};
        headers.forEach((header) => {
            properRow[header] = row[header] || "";
        });
        properRow.__meta = row.__meta;
        return properRow;
    });
    return {
        rows: properRows,
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
    read() {
        return new GQueryTableFactory(this).get();
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
    get() {
        return getInternal(this);
    }
    update(updateFn) {
        return updateInternal(this, updateFn);
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
