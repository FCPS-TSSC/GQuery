import { GQueryReadOptions } from "./read";
export declare class GQuery {
    spreadsheetId: string;
    constructor(spreadsheetId?: string);
    read(sheetName: string, options?: GQueryReadOptions): import("./read").GQueryReadData;
    readMany(sheetNames: string[]): void;
}
export type GQueryFilter = (row: any) => boolean;
