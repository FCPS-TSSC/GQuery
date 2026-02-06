/**
 * Options for reading data from Google Sheets
 */
type GQueryReadOptions = {
    /** How values should be rendered in the output */
    valueRenderOption?: ValueRenderOption;
    /** How dates and times should be rendered in the output */
    dateTimeRenderOption?: DateTimeRenderOption;
};
/**
 * Result structure returned by GQuery operations
 */
type GQueryResult = {
    /** Array of row objects */
    rows: GQueryRow[];
    /** Column headers from the sheet */
    headers: string[];
};
/**
 * A single row with metadata about its position in the sheet
 */
type GQueryRow = Record<string, any> & {
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
declare enum ValueRenderOption {
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
declare enum DateTimeRenderOption {
    /** Dates and times will be rendered as strings according to cell formatting */
    FORMATTED_STRING = "FORMATTED_STRING",
    /** Dates and times will be rendered as serial numbers */
    SERIAL_NUMBER = "SERIAL_NUMBER"
}

/**
 * Main GQuery class for interacting with Google Sheets
 * Provides a query-like interface for reading and writing spreadsheet data
 */
declare class GQuery {
    spreadsheetId: string;
    /**
     * Create a new GQuery instance
     * @param spreadsheetId Optional spreadsheet ID. If not provided, uses the active spreadsheet
     */
    constructor(spreadsheetId?: string);
    /**
     * Get a table reference for a specific sheet
     * @param sheetName Name of the sheet
     * @returns GQueryTable instance for chaining operations
     */
    from(sheetName: string): GQueryTable;
    /**
     * Efficiently fetch data from multiple sheets at once
     * @param sheetNames Array of sheet names to fetch
     * @param options Optional rendering options
     * @returns Object mapping sheet names to their data
     */
    getMany(sheetNames: string[], options?: GQueryReadOptions): {
        [sheetName: string]: GQueryResult;
    };
}
/**
 * Represents a single sheet table for query operations
 */
declare class GQueryTable {
    gquery: GQuery;
    spreadsheetId: string;
    spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet;
    sheetName: string;
    sheet: GoogleAppsScript.Spreadsheet.Sheet;
    constructor(gquery: GQuery, spreadsheetId: string, sheetName: string);
    /**
     * Select specific columns to return
     * @param headers Array of column names to select
     * @returns GQueryTableFactory for chaining
     */
    select(headers: string[]): GQueryTableFactory;
    /**
     * Filter rows based on a condition
     * @param filterFn Function that returns true for rows to include
     * @returns GQueryTableFactory for chaining
     */
    where(filterFn: (row: any) => boolean): GQueryTableFactory;
    /**
     * Join with another sheet
     * @param sheetName Name of sheet to join with
     * @param sheetColumn Column in the joined sheet to match on
     * @param joinColumn Column in this sheet to match on
     * @param columnsToReturn Optional array of columns to return from joined sheet
     * @returns GQueryTableFactory for chaining
     */
    join(sheetName: string, sheetColumn: string, joinColumn: string, columnsToReturn?: string[]): GQueryTableFactory;
    /**
     * Update rows in the sheet
     * @param updateFn Function that receives a row and returns updated values
     * @returns GQueryResult with updated rows
     */
    update(updateFn: (row: Record<string, any>) => Record<string, any>): GQueryResult;
    /**
     * Append new rows to the sheet
     * @param data Single object or array of objects to append
     * @returns GQueryResult with appended rows
     */
    append(data: {
        [key: string]: any;
    }[] | {
        [key: string]: any;
    }): GQueryResult;
    /**
     * Get data from the sheet
     * @param options Optional rendering options
     * @returns GQueryResult with rows and headers
     */
    get(options?: GQueryReadOptions): GQueryResult;
    /**
     * Execute a Google Visualization API query
     * @param query Query string in Google Query Language
     * @returns GQueryResult with query results
     */
    query(query: string): GQueryResult;
    /**
     * Delete rows from the sheet
     * @returns Object with count of deleted rows
     */
    delete(): {
        deletedRows: number;
    };
}
/**
 * Factory class for building and executing queries with filters and joins
 */
declare class GQueryTableFactory {
    gQueryTable: GQueryTable;
    selectOption?: string[];
    filterOption?: (row: any) => boolean;
    joinOption: {
        sheetName: string;
        sheetColumn: string;
        joinColumn: string;
        columnsToReturn?: string[];
    }[];
    constructor(GQueryTable: GQueryTable);
    select(headers: string[]): GQueryTableFactory;
    where(filterFn: (row: any) => boolean): GQueryTableFactory;
    join(sheetName: string, sheetColumn: string, joinColumn: string, columnsToReturn?: string[]): GQueryTableFactory;
    get(options?: GQueryReadOptions): GQueryResult;
    update(updateFn: (row: Record<string, any>) => Record<string, any>): GQueryResult;
    append(data: {
        [key: string]: any;
    }[] | {
        [key: string]: any;
    }): GQueryResult;
    delete(): {
        deletedRows: number;
    };
}

export { DateTimeRenderOption, GQuery, GQueryTable, GQueryTableFactory, ValueRenderOption };
export type { GQueryReadOptions, GQueryResult, GQueryRow };
