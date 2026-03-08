import { GQuery, GQueryTable, GQueryTableFactory } from "./index";
import { GQueryReadOptions, GQueryResult } from "./types";
export declare function getManyInternal(gquery: GQuery, sheetNames: string[], options?: GQueryReadOptions): {
    [sheetName: string]: GQueryResult;
};
export declare function getInternal<T extends Record<string, any> = Record<string, any>>(gqueryTableFactory: GQueryTableFactory<T>, options?: GQueryReadOptions): GQueryResult<T>;
export declare function queryInternal(gqueryTable: GQueryTable, query: string): GQueryResult;
