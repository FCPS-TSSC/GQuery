declare class GQuery {
    spreadsheetId: string;
    constructor(spreadsheetId?: string);
    from(sheetName: string): GQueryTable;
    getMany(sheetNames: string[], options?: GQueryReadOptions): {
        [sheetName: string]: GQueryResult;
    };
}
declare class GQueryTable {
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
    append(data: {
        [key: string]: any;
    }[] | {
        [key: string]: any;
    }): GQueryResult;
    get(options?: GQueryReadOptions): GQueryResult;
}
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
}
type GQueryReadOptions = {
    valueRenderOption?: ValueRenderOption;
    dateTimeRenderOption?: DateTimeRenderOption;
};
type GQueryResult = {
    rows: GQueryRow[];
    headers: string[];
};
type GQueryRow = Record<string, any> & {
    __meta: {
        rowNum: number;
        colLength: number;
    };
};
declare enum ValueRenderOption {
    FORMATTED_VALUE = "FORMATTED_VALUE",
    UNFORMATTED_VALUE = "UNFORMATTED_VALUE",
    FORMULA = "FORMULA"
}
declare enum DateTimeRenderOption {
    FORMATTED_STRING = "FORMATTED_STRING",
    SERIAL_NUMBER = "SERIAL_NUMBER"
}

export { DateTimeRenderOption, GQuery, GQueryTable, GQueryTableFactory, ValueRenderOption };
export type { GQueryReadOptions, GQueryResult, GQueryRow };
