import { callHandler } from "./ratelimit";
import { GQueryRow } from "./types";

/**
 * Parse raw sheet values into GQueryRow objects with metadata
 * @param headers Column headers from the sheet
 * @param values Raw values from the sheet (without header row)
 * @returns Array of GQueryRow objects
 */
export function parseRows(
  headers: string[],
  values: any[][]
): GQueryRow[] {
  return values.map((row, rowIndex) => {
    const obj: GQueryRow = {
      __meta: {
        rowNum: rowIndex + 2, // +2 because header is row 1, data starts at row 2
        colLength: headers.length,
      },
    } as GQueryRow;

    headers.forEach((header: string, i: number) => {
      obj[header] = row[i] !== undefined ? row[i] : "";
    });

    return obj;
  });
}

/**
 * Fetch all data from a sheet including headers
 * @param spreadsheetId The ID of the spreadsheet
 * @param sheetName The name of the sheet to fetch
 * @returns Object containing headers and rows
 */
export function fetchSheetData(
  spreadsheetId: string,
  sheetName: string
): { headers: string[]; rows: GQueryRow[] } {
  const response = callHandler(() =>
    Sheets.Spreadsheets!.Values!.get(spreadsheetId, sheetName)
  );
  
  const values = response.values || [];

  if (values.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = values[0].map((h: any) => String(h));
  const rows = parseRows(headers, values.slice(1));

  return { headers, rows };
}
