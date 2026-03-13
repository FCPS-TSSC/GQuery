import { GQueryTableFactory } from "./index";
import { GQueryResult, GQueryRow } from "./types";
export declare function updateInternal<T extends Record<string, any> = Record<string, any>>(GQueryTableFactory: GQueryTableFactory<T>, updateFn: (row: GQueryRow<T>) => Partial<T>): GQueryResult<T>;
