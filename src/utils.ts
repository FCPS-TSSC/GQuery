import { callHandler } from "./ratelimit";
import { GQueryRow } from "./types";

export function parseRows(
  headers: string[],
  values: any[][]
): GQueryRow[] {
  return values.map((row, rowIndex) => {
    const obj: GQueryRow = {
      __meta: {
        rowNum: rowIndex + 2, // +2 because header row is 1
        colLength: headers.length,
      },
    } as GQueryRow;

    headers.forEach((header: string, i: number) => {
      obj[header] = row[i] !== undefined ? row[i] : "";
    });

    return obj;
  });
}

export function fetchSheetData(
  spreadsheetId: string,
  sheetName: string
): { headers: string[]; rows: GQueryRow[] } {
  const response = callHandler(() =>
    Sheets.Spreadsheets.Values.get(spreadsheetId, sheetName)
  );
  const values = response.values || [];

  if (values.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = values[0].map((h: any) => String(h));
  const rows = parseRows(headers, values.slice(1));

  return { headers, rows };
}
