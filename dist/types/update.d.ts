import { GQueryTableFactory } from "./index";
import { GQueryResult } from "./types";
export declare function updateInternal(gQueryTableFactory: GQueryTableFactory, updateFn: (row: Record<string, any>) => Record<string, any>): GQueryResult;
