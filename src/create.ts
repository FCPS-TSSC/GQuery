// filepath: c:\Users\liamr\Projects\GQuery\src\create.ts
import { DateTimeRenderOption, ValueRenderOption } from "./index";

/**
 * Options for creating data in a Google Sheet
 */
export interface GQueryCreateOptions {
  /**
   * How values should be rendered in the response
   */
  responseValueRenderOption?: ValueRenderOption;

  /**
   * How dates, times, and durations should be rendered in the response
   */
  responseDateTimeRenderOption?: DateTimeRenderOption;

  /**
   * Whether to include values in the response
   */
  includeValuesInResponse?: boolean;
}

/**
 * Result of a create operation
 */
export interface CreateResult {
  /**
   * The number of rows created
   */
  createdRows: number;

  /**
   * The sheet name where data was created
   */
  sheetName: string;

  /**
   * The values that were added (if includeValuesInResponse is true)
   */
  addedRows?: any[][];
}

/**
 * Creates data in a Google Sheet
 * @param spreadsheetId The ID of the spreadsheet
 * @param sheetName The name of the sheet to create data in
 * @param data Array of objects to create as rows
 * @param options Additional options for the create operation
 * @returns Object containing create statistics
 */
export function createImplementation(
  spreadsheetId: string,
  sheetName: string,
  data: Record<string, any>[],
  options: GQueryCreateOptions = {
    responseValueRenderOption: ValueRenderOption.FORMATTED_VALUE,
    responseDateTimeRenderOption: DateTimeRenderOption.FORMATTED_STRING,
    includeValuesInResponse: true,
  }
): CreateResult {
  if (!data || data.length === 0) {
    return { createdRows: 0, sheetName };
  }

  // Get all unique headers from the data
  const allHeaders = new Set<string>();
  data.forEach((row) => {
    Object.keys(row).forEach((key) => {
      allHeaders.add(key);
    });
  });

  const headers = Array.from(allHeaders);
  const values: any[][] = [];

  // Convert each data object to an array of values
  data.forEach((row) => {
    const rowValues = headers.map((header) => {
      return row[header] !== undefined ? row[header] : "";
    });
    values.push(rowValues);
  });

  // Use Sheets API to append values
  const valueRange = {
    values: values,
  };

  // Configure request options
  const appendOptions: any = {
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
  };

  // Include response options if specified
  if (options.includeValuesInResponse) {
    appendOptions.includeValuesInResponse = true;

    if (options.responseValueRenderOption) {
      appendOptions.responseValueRenderOption =
        options.responseValueRenderOption;
    }

    if (options.responseDateTimeRenderOption) {
      appendOptions.responseDateTimeRenderOption =
        options.responseDateTimeRenderOption;
    }
  }

  // Execute the append request
  const response = Sheets.Spreadsheets.Values.append(
    valueRange,
    spreadsheetId,
    sheetName,
    appendOptions
  );

  // Return result with added rows if requested
  const result: CreateResult = {
    createdRows: data.length,
    sheetName,
  };

  if (
    options.includeValuesInResponse &&
    response.updates &&
    response.updates.updatedData &&
    response.updates.updatedData.values
  ) {
    result.addedRows = response.updates.updatedData.values;
  }

  return result;
}

/**
 * Converts a column number to column letter (e.g., 1 -> A, 27 -> AA)
 * This is used for range references
 */
function getColumnLetter(columnNumber: number): string {
  let dividend = columnNumber;
  let columnLetter = "";

  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    columnLetter = String.fromCharCode(65 + modulo) + columnLetter;
    dividend = Math.floor((dividend - modulo) / 26);
  }

  return columnLetter;
}
