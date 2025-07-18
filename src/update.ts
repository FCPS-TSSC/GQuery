import { GQueryTableFactory } from "./index";
import { callHandler } from "./ratelimit";
import { GQueryResult, GQueryRow } from "./types";

export function updateInternal(
  gQueryTableFactory: GQueryTableFactory,
  updateFn: (row: Record<string, any>) => Record<string, any>
): GQueryResult {
  // Get table configuration
  const spreadsheetId = gQueryTableFactory.gQueryTable.spreadsheetId;
  const sheetName = gQueryTableFactory.gQueryTable.sheetName;
  const range = sheetName;

  // Fetch current data from the sheet
  const response = callHandler(() =>
    Sheets.Spreadsheets.Values.get(spreadsheetId, range)
  );
  const values = response.values || [];

  if (values.length === 0) {
    return { rows: [], headers: [] };
  }

  // Extract headers and rows
  const headers = values[0];
  const rows = values.slice(1).map((row) => {
    const obj: Record<string, any> = {};
    headers.forEach((header: string, i: number) => {
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
        } catch (error) {
          console.error("Error filtering row:", error);
          return false;
        }
      });
    } catch (error) {
      console.error("Error in filter function:", error);
      return { rows: [], headers };
    }
  } else {
    filteredRows = rows;
  }

  // Update filtered rows
  const updatedRows = filteredRows.map((row) => {
    // Apply the update function to get the updated row values
    const updatedRow = { ...row };
    try {
      const result = updateFn(updatedRow);
      // Handle both return value updates and direct modifications
      Object.assign(updatedRow, result);
    } catch (error) {
      console.error("Error updating row:", error);
    }

    // Find the index of this row in the original data array
    const rowIndex = rows.findIndex((origRow) =>
      Object.keys(origRow).every((key) => origRow[key] === row[key])
    );

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
  const changedCells = new Map<string, any[]>();

  // For each updated row, determine which cells changed
  updatedRows.forEach((updatedRow) => {
    if (!updatedRow.__meta) return;

    const rowIndex = updatedRow.__meta.rowNum - 2;
    const originalRow = rows[rowIndex];

    headers.forEach((header, columnIndex) => {
      let updatedValue = updatedRow[header];

      // Convert Date objects to strings for comparison and storage
      if (updatedValue instanceof Date) {
        updatedValue = updatedValue.toLocaleString();
      }

      // Skip if values are the same
      if (originalRow[header] === updatedValue) return;

      // Only update if we have a meaningful value or if the original was empty
      // This prevents overwriting existing data with empty values
      if (
        updatedValue !== undefined &&
        updatedValue !== null &&
        updatedValue !== ""
      ) {
        // Use A1 notation for the column (A, B, C, etc.)
        const columnLetter = getColumnLetter(columnIndex);
        const cellRange = `${sheetName}!${columnLetter}${updatedRow.__meta.rowNum}`;

        // Store the change
        changedCells.set(cellRange, [[updatedValue]]);
      } else if (
        originalRow[header] === "" ||
        originalRow[header] === undefined ||
        originalRow[header] === null
      ) {
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
    // Group adjacent cells in the same column for more efficient updates
    const optimizedUpdates = optimizeRanges(changedCells);

    // Create a batch update request
    const batchUpdateRequest = {
      data: [],
      valueInputOption: "USER_ENTERED",
    };

    // Add each range to the batch request
    for (const [range, values] of Object.entries(optimizedUpdates)) {
      batchUpdateRequest.data.push({
        range: range,
        values: values,
      });
    }

    // Send a single batch update to Google Sheets
    callHandler(() =>
      Sheets.Spreadsheets.Values.batchUpdate(batchUpdateRequest, spreadsheetId)
    );
  }

  // If updates were made, properly return the filtered and updated rows
  // Make a fresh copy of the returned rows to ensure they have proper structure
  const resultRows =
    filteredRows.length > 0
      ? updatedRows.map((row) => {
          const resultRow: GQueryRow = { __meta: row.__meta };
          headers.forEach((header) => {
            resultRow[header] = row[header];
          });
          return resultRow;
        })
      : [];

  // Return the updated rows
  return {
    rows: resultRows as GQueryRow[],
    headers: headers,
  };
}

/**
 * Convert column index to column letter (0 -> A, 1 -> B, etc.)
 */
function getColumnLetter(columnIndex: number): string {
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
function optimizeRanges(changedCells: Map<string, any[]>): {
  [range: string]: any[][];
} {
  // Group cells by column
  const columnGroups = new Map<string, Map<number, any>>();

  for (const [cellRange, value] of changedCells.entries()) {
    // Extract column letter and row number from A1 notation
    const matches = cellRange.match(/([^!]+)!([A-Z]+)(\d+)$/);
    if (!matches) continue;

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
  const optimizedUpdates: { [range: string]: any[][] } = {};

  for (const [columnKey, rowsMap] of columnGroups.entries()) {
    // Sort row numbers
    const rowNumbers = Array.from(rowsMap.keys()).sort((a, b) => a - b);

    if (rowNumbers.length === 0) continue;

    // Find min and max to create one range per column
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
      let value = rowsMap.has(row) ? rowsMap.get(row) : "";

      // Convert Date objects to strings
      if (value instanceof Date) {
        value = value.toLocaleString();
      }

      values.push([value]);
    }

    optimizedUpdates[rangeKey] = values;
  }

  return optimizedUpdates;
}
