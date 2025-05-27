import { GQueryReadOptions, GQueryResult, GQueryTableFactory } from "./index";
export declare function getManyInternal(sheetNames: string[], options?: GQueryReadOptions): {
    [sheetName: string]: GQueryResult;
};
export declare function getInternal(gqueryTableFactory: GQueryTableFactory): GQueryResult;
