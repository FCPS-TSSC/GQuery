import { GQueryTable } from "./index";
import { callHandler } from "./ratelimit";
import { GQueryResult, GQueryRow } from "./types";

export function appendInternal(
  table: GQueryTable,
  data: { [key: string]: any }[]
): GQueryResult {
  // Validate input data
  if (!data || data.length === 0) {
    return { rows: [], headers: [] };
  }

  const spreadsheetId = table.spreadsheetId;
  const sheetName = table.sheetName;

  // Fetch headers from the first row
  const response = callHandler(() =>
    Sheets.Spreadsheets!.Values!.get(spreadsheetId, `${sheetName}!1:1`)
  );

  // Validate sheet exists and has headers
  if (!response || !response.values || response.values.length === 0) {
    throw new Error(`Sheet "${sheetName}" not found or has no headers`);
  }

  const headers = response.values[0].map((header) => String(header));

  // Map data to rows according to header order
  const rowsToAppend = data.map((item) => {
    return headers.map((header) => {
      let value = item[header];

      // Convert Date objects to locale strings
      if (value instanceof Date) {
        value = value.toLocaleString();
      }

      return value !== undefined ? value : "";
    });
  });

  // Append data using Sheets API
  const appendResponse = callHandler(() =>
    Sheets.Spreadsheets!.Values!.append(
      { values: rowsToAppend },
      spreadsheetId,
      sheetName,
      {
        valueInputOption: "USER_ENTERED",
        insertDataOption: "OVERWRITE",
        responseValueRenderOption: "FORMATTED_VALUE",
        responseDateTimeRenderOption: "FORMATTED_STRING",
        includeValuesInResponse: true,
      }
    )
  );

  // Validate append was successful
  if (
    !appendResponse ||
    !appendResponse.updates ||
    !appendResponse.updates.updatedRange
  ) {
    throw new Error("Failed to append data to sheet");
  }

  // Parse the updated range to get row numbers
  const updatedRange = appendResponse.updates.updatedRange;
  const rangeMatch = updatedRange.match(/([^!]+)!([A-Z]+)(\d+):([A-Z]+)(\d+)/);

  if (!rangeMatch) {
    throw new Error(`Could not parse updated range: ${updatedRange}`);
  }

  const startRow = parseInt(rangeMatch[3], 10);
  const endRow = parseInt(rangeMatch[5], 10);
  
  // Validate that all rows were appended
  const expectedRowCount = data.length;
  const actualRowCount = endRow - startRow + 1;
  if (actualRowCount !== expectedRowCount) {
    console.warn(
      `Expected to append ${expectedRowCount} rows but ${actualRowCount} were appended`
    );
  }

  // Create result rows with metadata
  const resultRows: GQueryRow[] = rowsToAppend.map((row, index) => {
    const rowObj: GQueryRow = {
      __meta: {
        rowNum: startRow + index,
        colLength: headers.length,
      },
    };

    // Map values to header names
    headers.forEach((header, colIndex) => {
      rowObj[header] = row[colIndex];
    });

    return rowObj;
  });

  return {
    rows: resultRows,
    headers,
  };
}
