import { GQueryFilter, Row } from "./index";
export declare function readImplementation(spreadsheetId: string, sheetName: string, options?: GQueryReadOptions): GQueryReadData;
export declare function readManyImplementation(spreadsheetId: string, sheetNames: string[], options?: GQueryReadOptions): Record<string, GQueryReadData>;
export type GQueryReadJoin = {
    on?: Record<string, string>;
    include?: string[];
};
export type GQueryReadOptions = {
    filter?: GQueryFilter;
    join?: Record<string, GQueryReadJoin>;
    valueRenderOption?: ValueRenderOption;
    dateTimeRenderOption?: DateTimeRenderOption;
};
export type GQueryReadData = {
    headers: string[];
    values: Row[];
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
