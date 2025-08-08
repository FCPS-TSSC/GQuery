import { GQueryRow } from "./types";

/**
 * Convert column index to column letter (0 -> A, 1 -> B, etc.)
 */
export function getColumnLetter(columnIndex: number): string {
  let columnLetter = "";
  let index = columnIndex;

  while (index >= 0) {
    columnLetter = String.fromCharCode(65 + (index % 26)) + columnLetter;
    index = Math.floor(index / 26) - 1;
  }

  return columnLetter;
}

/**
 * Convert raw row data to GQueryRow object with proper typing and metadata
 */
export function mapRowToObject(
  rowData: any[], 
  headers: string[], 
  rowIndex: number,
  applyTypeConversion: boolean = true
): GQueryRow {
  const row: GQueryRow = {
    __meta: {
      rowNum: rowIndex + 2, // +2 because we're starting from index 0 and row 1 is headers
      colLength: rowData.length,
    },
  };

  // First initialize all header fields to empty strings
  headers.forEach((header) => {
    row[header] = "";
  });

  // Map each column value to its corresponding header
  for (let j = 0; j < Math.min(rowData.length, headers.length); j++) {
    const header = headers[j];
    let value = rowData[j];

    if (value === null || value === undefined) {
      continue; // Skip processing but keep the empty string initialized earlier
    }

    // Apply type conversions if enabled
    if (applyTypeConversion && typeof value === "string" && value !== "") {
      value = convertStringValue(value);
    }

    row[header] = value;
  }

  return row;
}

/**
 * Convert string values to appropriate types (boolean, date, etc.)
 */
export function convertStringValue(value: string): any {
  // Auto-detect booleans
  if (value.toLowerCase() === "true" || value.toLowerCase() === "false") {
    return value.toLowerCase() === "true";
  }
  
  // Auto-detect dates (simple pattern for dates like MM/DD/YYYY, etc.)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}(\s\d{1,2}:\d{1,2}(:\d{1,2})?)?$/.test(value)) {
    try {
      const dateValue = new Date(value);
      if (!isNaN(dateValue.getTime())) {
        return dateValue;
      }
    } catch (e) {
      // Keep as string if conversion fails
    }
  }
  
  return value;
}

/**
 * Normalize value for storage (convert Date objects to strings, etc.)
 */
export function normalizeValueForStorage(value: any): any {
  if (value instanceof Date) {
    return value.toLocaleString();
  }
  return value !== undefined && value !== null ? value : "";
}

/**
 * Apply data type conversions based on metadata
 */
export function applyDataTypeConversion(
  value: any, 
  dataType: string
): any {
  if (!dataType || value === "" || value === null || value === undefined) {
    return value;
  }

  switch (dataType) {
    case "BOOLEAN":
      if (typeof value === "string") {
        return value.toLowerCase() === "true";
      }
      return Boolean(value);
      
    case "DATE_TIME":
    case "DATE":
    case "DATETIME":
      try {
        const dateValue = new Date(value);
        if (!isNaN(dateValue.getTime())) {
          return dateValue;
        }
      } catch (e) {
        // Keep original value if conversion fails
      }
      return value;
      
    case "NUMBER":
      const numValue = Number(value);
      if (!isNaN(numValue)) {
        return numValue;
      }
      return value;
      
    default:
      return value;
  }
}

/**
 * Create a lookup table for joins
 */
export function createJoinLookup(
  joinData: GQueryRow[], 
  joinColumn: string
): Record<string, GQueryRow[]> {
  const joinMap: Record<string, GQueryRow[]> = {};
  
  joinData.forEach((joinRow) => {
    const joinKey = String(joinRow[joinColumn]);
    if (!joinMap[joinKey]) {
      joinMap[joinKey] = [];
    }
    joinMap[joinKey].push(joinRow);
  });
  
  return joinMap;
}

/**
 * Handle errors consistently across the library
 */
export function handleError(operation: string, error: any): void {
  console.error(`Error in ${operation}:`, error);
}

/**
 * Check if two values are equal for comparison purposes
 */
export function valuesEqual(a: any, b: any): boolean {
  // Handle Date objects
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  
  // Handle Date to string comparison
  if (a instanceof Date && typeof b === "string") {
    return a.toLocaleString() === b;
  }
  
  if (b instanceof Date && typeof a === "string") {
    return b.toLocaleString() === a;
  }
  
  // Handle null/undefined equivalence with empty string
  if ((a === null || a === undefined || a === "") && 
      (b === null || b === undefined || b === "")) {
    return true;
  }
  
  return a === b;
}