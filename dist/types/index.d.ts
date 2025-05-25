import { GQueryReadOptions } from "./read";
export declare class GQuery {
    spreadsheetId: string;
    constructor(spreadsheetId?: string);
    read(sheetName: string, options?: GQueryReadOptions): import("./read").GQueryReadData;
    readMany(sheetNames: string[], options?: GQueryReadOptions): Record<string, import("./read").GQueryReadData>;
    update(sheetName: string, data: Row[]): void;
}
export type GQueryFilter = (row: any) => boolean;
export type Row = Record<string, any> & {
    __meta: {
        rowNum: number;
        colLength: number;
    };
};
