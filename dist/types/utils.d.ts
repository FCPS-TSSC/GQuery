import { GQueryRow } from "./types";
/**
 * Convert column index to column letter (0 -> A, 1 -> B, etc.)
 */
export declare function getColumnLetter(columnIndex: number): string;
/**
 * Convert raw row data to GQueryRow object with proper typing and metadata
 */
export declare function mapRowToObject(rowData: any[], headers: string[], rowIndex: number, applyTypeConversion?: boolean): GQueryRow;
/**
 * Convert string values to appropriate types (boolean, date, etc.)
 */
export declare function convertStringValue(value: string): any;
/**
 * Normalize value for storage (convert Date objects to strings, etc.)
 */
export declare function normalizeValueForStorage(value: any): any;
/**
 * Apply data type conversions based on metadata
 */
export declare function applyDataTypeConversion(value: any, dataType: string): any;
/**
 * Create a lookup table for joins
 */
export declare function createJoinLookup(joinData: GQueryRow[], joinColumn: string): Record<string, GQueryRow[]>;
/**
 * Handle errors consistently across the library
 */
export declare function handleError(operation: string, error: any): void;
/**
 * Check if two values are equal for comparison purposes
 */
export declare function valuesEqual(a: any, b: any): boolean;
