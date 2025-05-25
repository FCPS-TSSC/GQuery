import { GQueryFilter } from "./index";
export declare function readImplementation(spreadsheetId: string, sheetName: string, options?: GQueryReadOptions): GQueryReadData;
export type GQueryReadJoin = {
    sheets: string[];
    where?: (row: Record<string, any>) => boolean | Record<string, any>;
};
export type GQueryReadOptions = {
    filter?: GQueryFilter;
    join?: GQueryReadJoin;
    valueRenderOption?: ValueRenderOption;
    dateTimeRenderOption?: DateTimeRenderOption;
};
export type GQueryReadData = {
    headers: string[];
    values: Record<string, any>[];
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
export {};
