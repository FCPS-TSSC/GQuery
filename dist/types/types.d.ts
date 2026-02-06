/**
 * Options for reading data from Google Sheets
 */
export type GQueryReadOptions = {
    /** How values should be rendered in the output */
    valueRenderOption?: ValueRenderOption;
    /** How dates and times should be rendered in the output */
    dateTimeRenderOption?: DateTimeRenderOption;
};
/**
 * Result structure returned by GQuery operations
 */
export type GQueryResult = {
    /** Array of row objects */
    rows: GQueryRow[];
    /** Column headers from the sheet */
    headers: string[];
};
/**
 * A single row with metadata about its position in the sheet
 */
export type GQueryRow = Record<string, any> & {
    __meta: {
        /** 1-based row number in the sheet (row 1 is headers) */
        rowNum: number;
        /** Number of columns in the row */
        colLength: number;
    };
};
/**
 * How values should be rendered in the output
 * @see https://developers.google.com/sheets/api/reference/rest/v4/ValueRenderOption
 */
export declare enum ValueRenderOption {
    /** Values will be calculated and formatted according to cell formatting */
    FORMATTED_VALUE = "FORMATTED_VALUE",
    /** Values will be calculated but not formatted */
    UNFORMATTED_VALUE = "UNFORMATTED_VALUE",
    /** Values will not be calculated; formulas will be returned as-is */
    FORMULA = "FORMULA"
}
/**
 * How dates and times should be rendered in the output
 * @see https://developers.google.com/sheets/api/reference/rest/v4/DateTimeRenderOption
 */
export declare enum DateTimeRenderOption {
    /** Dates and times will be rendered as strings according to cell formatting */
    FORMATTED_STRING = "FORMATTED_STRING",
    /** Dates and times will be rendered as serial numbers */
    SERIAL_NUMBER = "SERIAL_NUMBER"
}
