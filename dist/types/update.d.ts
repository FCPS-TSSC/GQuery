import { DateTimeRenderOption, Row, ValueRenderOption } from "./index";
/**
 * Updates rows in a Google Sheet
 * @param spreadsheetId The ID of the spreadsheet
 * @param sheetName The name of the sheet to update
 * @param target Array of row objects to update
 * @param updateData Object containing field values to update
 * @param options Additional options for the update operation
 * @returns Object containing update statistics
 */
export declare function updateImplementation(spreadsheetId: string, sheetName: string, target: Row[], updateData: Record<string, any>, options?: GQueryUpdateOptions): UpdateResult;
export interface UpdateResult {
    updatedRows: number;
    updatedRowsData?: Row[];
    errors?: string[];
}
export type GQueryUpdateOptions = {
    valueInputOption?: "USER_ENTERED" | "RAW";
    includeValuesInResponse?: boolean;
    responseDateTimeRenderOption?: DateTimeRenderOption;
    responseValueRenderOption?: ValueRenderOption;
};
