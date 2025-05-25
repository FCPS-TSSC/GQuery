import { DateTimeRenderOption, ValueRenderOption } from "./index";
/**
 * Options for creating data in a Google Sheet
 */
export interface GQueryCreateOptions {
    /**
     * How values should be rendered in the response
     */
    responseValueRenderOption?: ValueRenderOption;
    /**
     * How dates, times, and durations should be rendered in the response
     */
    responseDateTimeRenderOption?: DateTimeRenderOption;
    /**
     * Whether to include values in the response
     */
    includeValuesInResponse?: boolean;
}
/**
 * Result of a create operation
 */
export interface CreateResult {
    /**
     * The number of rows created
     */
    createdRows: number;
    /**
     * The sheet name where data was created
     */
    sheetName: string;
    /**
     * The values that were added (if includeValuesInResponse is true)
     */
    addedRows?: any[][];
}
/**
 * Creates data in a Google Sheet
 * @param spreadsheetId The ID of the spreadsheet
 * @param sheetName The name of the sheet to create data in
 * @param data Array of objects to create as rows
 * @param options Additional options for the create operation
 * @returns Object containing create statistics
 */
export declare function createImplementation(spreadsheetId: string, sheetName: string, data: Record<string, any>[], options?: GQueryCreateOptions): CreateResult;
