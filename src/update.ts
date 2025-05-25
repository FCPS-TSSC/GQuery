import { DateTimeRenderOption, Row, ValueRenderOption } from "./index";

/**
 * Updates rows in a Google Sheet
 * @param spreadsheetId The ID of the spreadsheet
 * @param sheetName The name of the sheet to update
 * @param target Array of row objects to update
 * @param updateData Object containing field values to update
 * @param options Additional options for the update operation
 * @returns Object containing update statistics
 */
export function updateImplementation(
  spreadsheetId: string,
  sheetName: string,
  target: Row[],
  updateData: Record<string, any>,
  options?: GQueryUpdateOptions
): UpdateResult {
  if (!target || target.length === 0) {
    return { updatedRows: 0 };
  }

  // Apply the updateData object to each row
  const updatedRows = target.map((row) => {
    // Create a shallow copy of the row
    const updatedRow = { ...row };

    // Apply all updates from updateData object
    Object.entries(updateData).forEach(([key, value]) => {
      if (key !== "__meta") {
        // Protect __meta from being modified
        // Support function values that can use the current row
        updatedRow[key] = typeof value === "function" ? value(row) : value;
      }
    });

    return updatedRow;
  });

  console.log("Updated Rows:", updatedRows);

  // Sort data by row number to optimize updates
  const sortedData = [...updatedRows].sort(
    (a, b) => a.__meta.rowNum - b.__meta.rowNum
  );

  // Get all headers from the data to ensure we update all fields
  const allHeaders = new Set<string>();
  sortedData.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (key !== "__meta") {
        allHeaders.add(key);
      }
    });
  });

  const headers = Array.from(allHeaders);

  // Prepare the values for batch update
  const updates: BatchUpdate[] = [];

  sortedData.forEach((row) => {
    // Convert the row object back to an array in the correct header order
    const rowValues = headers.map((header) => {
      return row[header] !== undefined ? row[header] : "";
    });

    // Create a range for this row (A2:Z2 format)
    const rowNum = row.__meta.rowNum;
    const range = `${sheetName}!A${rowNum}:${getColumnLetter(
      headers.length
    )}${rowNum}`;

    updates.push({
      range,
      values: [rowValues],
    });
  });

  // Perform batch update
  let updatedCount = 0;

  if (updates.length > 0) {
    try {
      // Apply default options and override with provided options
      const updateOptions = {
        data: updates,
        valueInputOption: options?.valueInputOption || "USER_ENTERED",
        includeValuesInResponse:
          options?.includeValuesInResponse === undefined
            ? true
            : options.includeValuesInResponse,
        responseDateTimeRenderOption: options?.responseDateTimeRenderOption,
        responseValueRenderOption: options?.responseValueRenderOption,
      };

      const response = Sheets.Spreadsheets.Values.batchUpdate(
        updateOptions,
        spreadsheetId
      );

      updatedCount = response.totalUpdatedRows || 0;

      // Extract updated values from the response if includeValuesInResponse is true
      if (updateOptions.includeValuesInResponse && response.responses) {
        const updatedRowsData = response.responses
          .filter((resp) => resp.updatedData && resp.updatedData.values)
          .map((resp) => {
            const values = resp.updatedData.values[0]; // First row of updated values

            // Extract row number from the range
            const rangeMatch = resp.updatedData.range
              .split("!")[1]
              .match(/\d+/);
            if (!rangeMatch) {
              throw new Error(
                `Could not parse row number from range: ${resp.updatedData.range}`
              );
            }

            const rowNum = parseInt(rangeMatch[0]);

            // Find the corresponding row in sortedData by row number
            const originalRowData = sortedData.find(
              (row) => row.__meta.rowNum === rowNum
            );
            if (!originalRowData) {
              throw new Error(
                `Could not find original row data for row number: ${rowNum}`
              );
            }

            // Convert back to object with headers
            const rowObject = headers.reduce((obj, header, idx) => {
              obj[header] = values[idx];
              return obj;
            }, {} as Record<string, any>);

            // Add meta information from the original row
            (rowObject as Row).__meta = originalRowData.__meta;

            return rowObject as Row;
          });

        return {
          updatedRows: updatedCount,
          updatedRowsData,
        };
      }

      return { updatedRows: updatedCount };
    } catch (error) {
      throw new Error(`Failed to update sheet: ${error}`);
    }
  }

  return { updatedRows: updatedCount };
}

/**
 * Converts a column number to column letter (e.g., 1 -> A, 27 -> AA)
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

interface BatchUpdate {
  range: string;
  values: any[][];
}

export interface UpdateResult {
  updatedRows: number;
  updatedRowsData?: Row[];
  errors?: string[];
}

export type GQueryUpdateOptions = {
  valueInputOption?: "USER_ENTERED" | "RAW";
  includeValuesInResponse?: boolean;
  responseDateTimeRenderOption?: DateTimeRenderOption;
  responseValueRenderOption?: ValueRenderOption;
};
