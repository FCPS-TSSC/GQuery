import { GQueryTable } from "./index";
import { callHandler } from "./ratelimit";
import { GQueryResult, GQueryRow } from "./types";
import { normalizeValueForStorage } from "./utils";

export function appendInternal(
  table: GQueryTable,
  data: { [key: string]: any }[]
): GQueryResult {
  // If no data is provided or empty array, return empty result
  if (!data || data.length === 0) {
    return { rows: [], headers: [] };
  }

  // Extract spreadsheet information
  const spreadsheetId = table.spreadsheetId;
  const sheetName = table.sheetName;

  // First, get the current headers from the sheet
  const response = callHandler(() =>
    Sheets.Spreadsheets.Values.get(spreadsheetId, `${sheetName}!1:1`)
  );

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
  const appendResponse = callHandler(() =>
    Sheets.Spreadsheets.Values.append(
      { values: rowsToAppend },
      spreadsheetId,
      `${sheetName}`,
      {
        valueInputOption: "USER_ENTERED",
        insertDataOption: "OVERWRITE",
        responseValueRenderOption: "FORMATTED_VALUE",
        responseDateTimeRenderOption: "FORMATTED_STRING",
        includeValuesInResponse: true,
      }
    )
  );

  // Check if append was successful
  if (
    !appendResponse ||
    !appendResponse.updates ||
    !appendResponse.updates.updatedRange
  ) {
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
  const endRow = parseInt(rangeMatch[5]);

  // Create result rows with metadata
  const resultRows: GQueryRow[] = rowsToAppend.map((row, index) => {
    const rowObj: GQueryRow = {
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
