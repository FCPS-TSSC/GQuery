import { GQuery, GQueryTable, GQueryTableFactory } from "./index";
import { GQueryReadOptions, GQueryResult } from "./types";
export declare function getManyInternal(gquery: GQuery, sheetNames: string[], options?: GQueryReadOptions): {
    [sheetName: string]: GQueryResult;
};
export declare function getInternal(gqueryTableFactory: GQueryTableFactory, options?: GQueryReadOptions): GQueryResult;
export declare function queryInternal(gqueryTable: GQueryTable, query: string): GQueryResult;
