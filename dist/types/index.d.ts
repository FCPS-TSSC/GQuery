export declare class GQuery {
    spreadsheetId: string;
    constructor(spreadsheetId?: string);
    from(sheetName: string): GQueryTable;
    getMany(sheetNames: string[], options?: GQueryReadOptions): {
        [sheetName: string]: GQueryResult;
    };
}
/**
 * Idea end result:
 * user calls from("Sheet1")
 * if user calls .select(["Id", "Name"]) -- only return Id Name columns after read() is called
 * if user calls .filter((row) => row.Id === 1) -- only return rows where Id === 1 after read() is called
 * if user calls .join("Models", "Model", "Model_Name") -- join Models sheet on Model_Name (Models sheet) and Model (current sheet)
 * once read() is called, it will return the result of the query
 */
export declare class GQueryTable {
    gquery: GQuery;
    spreadsheetId: string;
    spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet;
    sheetName: string;
    sheet: GoogleAppsScript.Spreadsheet.Sheet;
    constructor(gquery: GQuery, spreadsheetId: string, sheetName: string);
    select(headers: string[]): GQueryTableFactory;
    where(filterFn: (row: any) => boolean): GQueryTableFactory;
    join(sheetName: string, sheetColumn: string, joinColumn: string, columnsToReturn?: string[]): GQueryTableFactory;
    update(updateFn: (row: Record<string, any>) => Record<string, any>): GQueryResult;
    read(): GQueryResult;
}
export declare class GQueryTableFactory {
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
    get(): GQueryResult;
    update(updateFn?: (row: Record<string, any>) => Record<string, any>): GQueryResult;
}
export type GQueryReadOptions = {
    valueRenderOption?: ValueRenderOption;
    dateTimeRenderOption?: DateTimeRenderOption;
};
export type GQueryResult = {
    rows: GQueryRow[];
    headers: string[];
};
export type GQueryRow = Record<string, any> & {
    __meta: {
        rowNum: number;
        colLength: number;
    };
};
export declare enum ValueRenderOption {
    FORMATTED_VALUE = "FORMATTED_VALUE",
    UNFORMATTED_VALUE = "UNFORMATTED_VALUE",
    FORMULA = "FORMULA"
}
export declare enum DateTimeRenderOption {
    FORMATTED_STRING = "FORMATTED_STRING",
    SERIAL_NUMBER = "SERIAL_NUMBER"
}
