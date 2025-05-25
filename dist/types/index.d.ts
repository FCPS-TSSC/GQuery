import { GQueryReadOptions } from "./read";
import { GQueryUpdateOptions } from "./update";
import { GQueryCreateOptions, CreateResult } from "./create";
export declare class GQuery {
    spreadsheetId: string;
    constructor(spreadsheetId?: string);
    create(sheetName: string, data: Record<string, any>[], options?: GQueryCreateOptions): CreateResult;
    read(sheetName: string, options?: GQueryReadOptions): import("./read").GQueryReadData;
    readMany(sheetNames: string[], options?: GQueryReadOptions): Record<string, import("./read").GQueryReadData>;
    update(sheetName: string, data: Row[], options?: GQueryUpdateOptions): import("./update").UpdateResult;
}
export type GQueryFilter = (row: any) => boolean;
export type Row = Record<string, any> & {
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
