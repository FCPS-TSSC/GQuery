import { DateTimeRenderOption, GQueryFilter, Row, ValueRenderOption } from "./index";
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
