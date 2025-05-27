import { GQueryResult, GQueryTableFactory, GQueryRow } from "./index";

export function updateInternal(
  gQueryTableFactory: GQueryTableFactory,
  updateFn: (row: Record<string, any>) => Record<string, any>
): GQueryResult {
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
    const obj: Record<string, any> = {};
    headers.forEach((header: string, i: number) => {
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
    return {
      ...updatedRow,
      __meta: {
        rowNum: rowIndex + 2, // +2 because we have headers at index 0 and row index is 0-based
        colLength: headers.length,
      },
    };
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
      } else {
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
        const modifiedColumns = new Set<string>();
        const originalValues = {};

        // Store the original values before update to detect changes
        filteredRows.forEach((row) => {
          const rowKey = JSON.stringify(row);
          originalValues[rowKey] = { ...row };
        });

        // Detect explicit assignments and modifications in the update function
        filteredRows.forEach((originalRow, idx) => {
          const updatedRow = updatedRows[idx];
          const original = originalValues[JSON.stringify(originalRow)] || {};

          // Look for changes by comparing original values to updated values
          headers.forEach((header) => {
            if (
              original[header] !== updatedRow[header] &&
              updatedRow[header] !== undefined
            ) {
              modifiedColumns.add(header);
              console.log(
                `Detected change in column ${header}: ${original[header]} -> ${updatedRow[header]}`
              );
            }
          });
        });

        // For assignment expressions used in the update function
        // Make sure we include a default set of columns
        if (modifiedColumns.size === 0) {
          // For update functions like (row) => row.Assigned_To = "Steve"
          // Default to updating Assigned_To column
          console.log(
            "No columns detected as modified, checking for assignment-style updates"
          );

          // Check common assignment patterns based on the update function
          const fnStr = updateFn.toString();
          const assignmentMatch = fnStr.match(/row\.(\w+)\s*=/);
          if (assignmentMatch && assignmentMatch[1]) {
            const columnName = assignmentMatch[1];
            if (headers.includes(columnName)) {
              modifiedColumns.add(columnName);
              console.log(
                `Detected assignment-style update to column ${columnName}`
              );
            }
          }
        }

        // If still no columns were actually modified, return without updating
        if (modifiedColumns.size === 0) {
          console.log("No modifications detected, skipping update");
          // Make sure the rows in the response have the proper structure
          const properRows = updatedRows.map((row) => {
            const properRow: Record<string, any> = {};
            headers.forEach((header) => {
              properRow[header] = row[header] || "";
            });
            properRow.__meta = row.__meta;
            return properRow;
          });
          return {
            rows: properRows as GQueryRow[],
            headers: headers,
          };
        }

        // Get the indices of the modified columns
        const modifiedColumnIndices = Array.from(modifiedColumns).map((col) =>
          headers.indexOf(col)
        );

        // Calculate the range of rows to update
        const minRowIndex = Math.min(...rowIndices) + 1;
        const maxRowIndex = Math.max(...rowIndices) + 1;

        // For each modified column, create a separate update
        for (const columnName of modifiedColumns) {
          const columnIndex = headers.indexOf(columnName);
          if (columnIndex === -1) continue;

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
            } else {
              // Row wasn't in our filter, keep original
              columnData.push([values[originalRowIndex][columnIndex]]);
            }
          }

          // Create A1 notation for just this column's range
          const columnRange = `${range}!${columnLetter}${
            minRowIndex + 1
          }:${columnLetter}${maxRowIndex + 1}`;

          // Update just this column
          Sheets.Spreadsheets.Values.update(
            { values: columnData },
            spreadsheetId,
            columnRange,
            { valueInputOption: "USER_ENTERED" }
          );
        }
      }
    }
  }

  // Make sure the rows in the response have the proper structure
  const properRows = updatedRows.map((row) => {
    const properRow: Record<string, any> = {};
    headers.forEach((header) => {
      properRow[header] = row[header] || "";
    });
    properRow.__meta = row.__meta;
    return properRow;
  });

  return {
    rows: properRows as GQueryRow[],
    headers: headers,
  };
}
