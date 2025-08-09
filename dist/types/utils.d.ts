import { GQueryRow } from "./types";
export declare function parseRows(headers: string[], values: any[][]): GQueryRow[];
export declare function fetchSheetData(spreadsheetId: string, sheetName: string): {
    headers: string[];
    rows: GQueryRow[];
};
