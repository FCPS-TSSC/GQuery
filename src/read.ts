import { GQueryFilter } from "./index";

export function readImplementation(
  spreadsheetId: string,
  sheetName: string,
  options: GQueryReadOptions = {
    dateTimeRenderOption: DateTimeRenderOption.FORMATTED_STRING,
    valueRenderOption: ValueRenderOption.FORMATTED_VALUE,
  }
): GQueryReadData {
  var sheets = Array.isArray(sheetName) ? sheetName : [sheetName];
  if (options?.join && "sheets" in options.join) {
    sheets = [...new Set([...sheets, ...options.join.sheets])];
  }

  // Get sheet data using the Sheets API batchGet method
  const ranges = sheets.map((sheet) => `${sheet}!A:ZZ`); // Get all data from each sheet
  const batchResponse = Sheets?.Spreadsheets?.Values?.batchGet?.(
    spreadsheetId,
    {
      ranges: ranges,
      valueRenderOption: options?.valueRenderOption,
      dateTimeRenderOption: options?.dateTimeRenderOption,
    }
  );

  // Process the response into the expected format
  const response: Record<string, { headers: string[]; rows: any[][] }> = {};

  if (batchResponse && batchResponse.valueRanges) {
    batchResponse.valueRanges.forEach((valueRange, index) => {
      const currentSheet = sheets[index];
      if (valueRange.values && valueRange.values.length > 0) {
        response[currentSheet] = {
          headers: valueRange.values[0],
          rows: valueRange.values.slice(1).filter((row) => row.length > 0), // Filter out empty rows
        };
      } else {
        response[currentSheet] = { headers: [], rows: [] };
      }
    });
  }

  // Process primary sheet data
  let mainData = processSheetData(response[sheetName]);

  // Apply filter if provided
  if (options?.filter) {
    mainData = {
      headers: mainData.headers,
      values: mainData.values.filter((row) => options.filter!(row)),
    };
  }

  // Apply join if provided
  if (options?.join && options.join.sheets && options.join.sheets.length > 0) {
    const joinedData = applyJoin(mainData, response, sheetName, options.join);
    return joinedData;
  }

  return mainData;
}

// Helper function to process raw sheet data into rows with header keys
function processSheetData(sheetData: {
  headers: string[];
  rows: any[][];
}): GQueryReadData {
  if (!sheetData) {
    return { headers: [], values: [] };
  }

  const { headers, rows } = sheetData;
  const values = rows.map((row) => {
    return row.reduce<Record<string, any>>((obj, cellValue, index) => {
      obj[headers[index]] = cellValue;
      return obj;
    }, {});
  });

  return { headers, values };
}

// Helper function to apply join operations
function applyJoin(
  mainData: GQueryReadData,
  allSheetData: Record<string, { headers: string[]; rows: any[][] }>,
  mainSheetName: string,
  join: GQueryReadJoin
): GQueryReadData {
  // Process joined sheets data
  const joinedSheetsData = join.sheets.reduce<Record<string, GQueryReadData>>(
    (acc, sheetName) => {
      if (allSheetData[sheetName]) {
        acc[sheetName] = processSheetData(allSheetData[sheetName]);
      }
      return acc;
    },
    {}
  );

  // If no where function provided, return unmodified data
  if (!join.where) {
    return mainData;
  }

  const result: GQueryReadData = {
    headers: [...mainData.headers],
    values: [],
  };

  // Create a context object with all data
  const context: Record<string, any> = {};

  // Add the main sheet data as an array of objects
  context[mainSheetName] = mainData.values;

  // Add all joined sheets' data
  Object.entries(joinedSheetsData).forEach(([sheetName, data]) => {
    context[sheetName] = data.values;
  });

  // Capture the returned object from array methods like some()
  let capturedReturnValue: any = null;

  // Override Array.prototype.some for this execution
  const originalSome = Array.prototype.some;
  Array.prototype.some = function (callback: any) {
    for (let i = 0; i < this.length; i++) {
      const returnValue = callback(this[i], i, this);
      if (returnValue && typeof returnValue === "object") {
        // Capture the returned object
        capturedReturnValue = returnValue;
      }
      if (returnValue) return true;
    }
    return false;
  };

  try {
    // Apply the where function with the context
    const whereResult = join.where(context);

    // Process the result based on its type
    if (Array.isArray(whereResult)) {
      // If an array is returned, use it as the values
      result.values = whereResult;

      // Update headers if new properties were added in the returned objects
      if (whereResult.length > 0) {
        const allKeys = new Set(result.headers);
        whereResult.forEach((row) => {
          Object.keys(row).forEach((key) => allKeys.add(key));
        });
        result.headers = Array.from(allKeys);
      }
    } else if (whereResult === true && capturedReturnValue) {
      // If true is returned from an array method like some() and we captured a return value
      // Only include the values from the original item and specifically returned properties
      result.values = mainData.values.map((originalItem) => {
        // Start with the original item
        const resultItem = { ...originalItem };

        // Only add the specific properties from the captured return value
        if (capturedReturnValue) {
          Object.keys(capturedReturnValue).forEach((key) => {
            if (!originalItem.hasOwnProperty(key)) {
              resultItem[key] = capturedReturnValue[key];
            }
          });
        }

        return resultItem;
      });

      // Update headers to include the new properties
      if (result.values.length > 0 && capturedReturnValue) {
        const newKeys = Object.keys(capturedReturnValue).filter(
          (key) =>
            !result.headers.includes(key) &&
            !mainData.values[0].hasOwnProperty(key)
        );
        if (newKeys.length > 0) {
          result.headers.push(...newKeys);
        }
      }
    } else if (whereResult && typeof whereResult === "object") {
      // If a single object is returned, use it as a single row
      result.values.push(whereResult);

      // Update headers if new properties were added
      const newKeys = Object.keys(whereResult).filter(
        (key) => !result.headers.includes(key)
      );
      if (newKeys.length > 0) {
        result.headers.push(...newKeys);
      }
    }
  } finally {
    // Restore the original method
    Array.prototype.some = originalSome;
  }

  return result;
}

export type GQueryReadJoin = {
  sheets: string[];
  where?: (row: Record<string, any>) => boolean | Record<string, any>;
};

export type GQueryReadOptions = {
  filter?: GQueryFilter;
  join?: GQueryReadJoin;
  valueRenderOption?: ValueRenderOption;
  dateTimeRenderOption?: DateTimeRenderOption;
};

export type GQueryReadData = {
  headers: string[];
  values: Record<string, any>[];
};

enum ValueRenderOption {
  FORMATTED_VALUE = "FORMATTED_VALUE",
  UNFORMATTED_VALUE = "UNFORMATTED_VALUE",
  FORMULA = "FORMULA",
}

enum DateTimeRenderOption {
  FORMATTED_STRING = "FORMATTED_STRING",
  SERIAL_NUMBER = "SERIAL_NUMBER",
}
