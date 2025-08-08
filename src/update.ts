import { GQueryTableFactory } from "./index";
import { callHandler } from "./ratelimit";
import { GQueryResult, GQueryRow } from "./types";
import { 
  getColumnLetter, 
  mapRowToObject, 
  normalizeValueForStorage,
  valuesEqual,
  handleError
} from "./utils";

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
  const rows = values.slice(1).map((row, index) => 
    mapRowToObject(row, headers, index, false)
  );

  // Filter rows if where function is provided
  let filteredRows = [];
  if (gQueryTableFactory.filterOption) {
    try {
      filteredRows = rows.filter((row) => {
        try {
          return gQueryTableFactory.filterOption(row);
        } catch (error) {
          handleError("filtering row", error);
          return false;
        }
      });
    } catch (error) {
      handleError("filter function", error);
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
      handleError("updating row", error);
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
      let updatedValue = normalizeValueForStorage(updatedRow[header]);
      let originalValue = normalizeValueForStorage(originalRow[header]);

      // Skip if values are the same
      if (valuesEqual(originalValue, updatedValue)) return;

      // Only update if we have a meaningful value OR if we explicitly want to clear a cell
      // This prevents overwriting existing data with empty values unless intentional
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
        (originalValue === "" || originalValue === undefined || originalValue === null) &&
        (updatedValue === "" || updatedValue === undefined || updatedValue === null)
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
