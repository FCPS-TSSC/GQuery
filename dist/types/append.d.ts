import { GQueryTable } from "./index";
import { GQueryReadOptions, GQueryResult } from "./types";
export declare function appendInternal<T extends Record<string, any> = Record<string, any>>(table: GQueryTable<T>, data: T[], options?: Pick<GQueryReadOptions, "validate">): GQueryResult<T>;
