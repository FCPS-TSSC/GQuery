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
      // Include the header row
      dataToUpdate.unshift(headers);

      Sheets.Spreadsheets.Values.update(
        { values: dataToUpdate },
        spreadsheetId,
        range,
        { valueInputOption: "USER_ENTERED" }
      );
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
