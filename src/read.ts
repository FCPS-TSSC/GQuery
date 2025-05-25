import {
  DateTimeRenderOption,
  GQueryFilter,
  Row,
  ValueRenderOption,
} from "./index";

export function readImplementation(
  spreadsheetId: string,
  sheetName: string,
  options: GQueryReadOptions = {
    dateTimeRenderOption: DateTimeRenderOption.FORMATTED_STRING,
    valueRenderOption: ValueRenderOption.FORMATTED_VALUE,
  }
): GQueryReadData {
  var sheets = [sheetName];
  if (options?.join) {
    sheets = [...new Set([...sheets, ...Object.keys(options.join)])];
  }

  const optionsWithoutFilterJoin = {
    valueRenderOption: options.valueRenderOption,
    dateTimeRenderOption: options.dateTimeRenderOption,
  };

  const allSheetData = readManyImplementation(
    spreadsheetId,
    sheets,
    optionsWithoutFilterJoin
  );

  // Get the main sheet data
  let mainData = allSheetData[sheetName];

  // Apply filter if provided
  if (options?.filter) {
    mainData = {
      headers: mainData.headers,
      values: mainData.values.filter((row) => options.filter!(row)),
    };
  }

  // Apply join if provided
  if (options?.join && Object.keys(options.join).length > 0) {
    const joinedData = applyJoin(
      mainData,
      allSheetData,
      Array.isArray(sheetName) ? sheetName[0] : sheetName,
      options.join
    );
    return joinedData;
  }

  return mainData;
}

export function readManyImplementation(
  spreadsheetId: string,
  sheetNames: string[],
  options: GQueryReadOptions = {
    dateTimeRenderOption: DateTimeRenderOption.FORMATTED_STRING,
    valueRenderOption: ValueRenderOption.FORMATTED_VALUE,
  }
): Record<string, GQueryReadData> {
  if (options.filter || options.join) {
    throw new Error(
      "Filter and join options are not supported in readManyImplementation."
    );
  }
  // Get sheet data using the Sheets API batchGet method
  const batchResponse = Sheets?.Spreadsheets?.Values?.batchGet?.(
    spreadsheetId,
    {
      ranges: sheetNames,
      valueRenderOption: options?.valueRenderOption,
      dateTimeRenderOption: options?.dateTimeRenderOption,
    }
  );

  // Process the response into the expected format
  const response: Record<string, { headers: string[]; rows: any[][] }> = {};

  if (batchResponse && batchResponse.valueRanges) {
    batchResponse.valueRanges.forEach((valueRange, index) => {
      const currentSheet = sheetNames[index];
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
  return sheetNames.reduce<Record<string, GQueryReadData>>((acc, sheetName) => {
    const sheetData = response[sheetName];
    acc[sheetName] = processSheetData(sheetData);
    return acc;
  }, {});
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
  const values = rows.map((row, rowIndex) => {
    const obj = row.reduce<Record<string, any>>((acc, cellValue, index) => {
      acc[headers[index]] = cellValue;
      return acc;
    }, {} as Record<string, any>);
    // Attach __meta property as required by Row type
    (obj as Row).__meta = {
      rowNum: rowIndex + 2, // +2 because headers are row 1, and rows is 0-based
      colLength: row.length,
    };
    return obj as Row;
  });

  return { headers, values };
}

// Helper function to apply join operations
function applyJoin(
  mainData: GQueryReadData,
  allSheetData: Record<string, GQueryReadData>,
  mainSheetName: string,
  join: Record<string, GQueryReadJoin>
): GQueryReadData {
  // Create result with main data's headers
  const result: GQueryReadData = {
    headers: [...mainData.headers],
    values: [...mainData.values],
  };

  // Process each main data row
  result.values = mainData.values.map((mainRow) => {
    const enrichedRow = { ...mainRow };

    // For each joined sheet
    Object.entries(join).forEach(([sheetName, joinConfig]) => {
      if (!allSheetData[sheetName]) return;

      const sheetData = allSheetData[sheetName];

      // Find matching rows in the joined sheet
      const matchingRows = sheetData.values.filter((joinRow) => {
        // Check all join conditions defined for this sheet
        const conditions = joinConfig.on;
        if (!conditions) return false;

        return Object.entries(conditions).every(([mainCol, joinCol]) => {
          return mainRow[mainCol] === joinRow[joinCol];
        });
      });

      // Add matching data to the main row
      if (matchingRows.length > 0) {
        // If includes is specified, only add those fields
        if (joinConfig.include && joinConfig.include.length > 0) {
          joinConfig.include.forEach((field) => {
            enrichedRow[`${sheetName}_${field}`] = matchingRows[0][field];
          });
        } else {
          // Otherwise add all fields with sheet name prefix to avoid collisions
          Object.entries(matchingRows[0]).forEach(([key, value]) => {
            if (key !== "__meta") {
              enrichedRow[`${sheetName}_${key}`] = value;
            }
          });
        }
      }
    });

    return enrichedRow;
  });

  // Update headers to include any new fields
  const allKeys = new Set<string>();
  result.values.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (key !== "__meta") {
        allKeys.add(key);
      }
    });
  });
  result.headers = Array.from(allKeys);

  return result;
}

export type GQueryReadJoin = {
  on?: Record<string, string>; // {mainField: joinField}
  include?: string[]; // fields to include
};

export type GQueryReadOptions = {
  filter?: GQueryFilter;
  join?: Record<string, GQueryReadJoin>;
  valueRenderOption?: ValueRenderOption;
  dateTimeRenderOption?: DateTimeRenderOption;
};

export type GQueryReadData = {
  headers: string[];
  values: Row[];
};
