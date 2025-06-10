import { GQueryTableFactory } from "./index";
import { callHandler } from "./ratelimit";

export function deleteInternal(gqueryTableFactory: GQueryTableFactory): {
  deletedRows: number;
} {
  // Get table configuration
  const spreadsheetId = gqueryTableFactory.gQueryTable.spreadsheetId;
  const sheetName = gqueryTableFactory.gQueryTable.sheetName;
  const sheet = gqueryTableFactory.gQueryTable.sheet;
  const sheetId = sheet.getSheetId();

  // Fetch current data from the sheet
  const response = callHandler(() =>
    Sheets.Spreadsheets.Values.get(spreadsheetId, sheetName)
  );
  const values = response.values || [];

  if (values.length <= 1) {
    // Only header row or empty sheet
    return { deletedRows: 0 };
  }

  // Extract headers and rows
  const headers = values[0];
  const rows: Record<string, any>[] = values.slice(1).map((row, rowIndex) => {
    const obj: Record<string, any> = {
      __meta: {
        rowNum: rowIndex + 2, // +2 because we're starting from index 0 and row 1 is headers
        colLength: row.length,
      },
    };

    headers.forEach((header: string, i: number) => {
      obj[header] = i < row.length ? row[i] : "";
    });

    return obj;
  });

  // If no filter option, nothing to delete
  if (!gqueryTableFactory.filterOption || rows.length === 0) {
    return { deletedRows: 0 };
  }

  // Find rows matching the filter condition (these will be deleted)
  const rowsToDelete = rows.filter((row) => {
    try {
      return gqueryTableFactory.filterOption(row);
    } catch (error) {
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
    callHandler(() =>
      Sheets.Spreadsheets.batchUpdate(batchUpdateRequest, spreadsheetId)
    );
  } catch (error) {
    console.error("Error deleting rows:", error);
    return { deletedRows: 0 };
  }

  return { deletedRows: rowsToDelete.length };
}
