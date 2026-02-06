import { GQueryRow } from "./types";
/**
 * Parse raw sheet values into GQueryRow objects with metadata
 * @param headers Column headers from the sheet
 * @param values Raw values from the sheet (without header row)
 * @returns Array of GQueryRow objects
 */
export declare function parseRows(headers: string[], values: any[][]): GQueryRow[];
/**
 * Fetch all data from a sheet including headers
 * @param spreadsheetId The ID of the spreadsheet
 * @param sheetName The name of the sheet to fetch
 * @returns Object containing headers and rows
 */
export declare function fetchSheetData(spreadsheetId: string, sheetName: string): {
    headers: string[];
    rows: GQueryRow[];
};
