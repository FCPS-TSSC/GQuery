import { GQuery, GQueryTable, GQueryTableFactory } from "./index";
import { callHandler } from "./ratelimit";
import {
  GQueryReadOptions,
  GQueryResult,
  ValueRenderOption,
  DateTimeRenderOption,
  GQueryRow,
} from "./types";
import { parseRows } from "./utils";

/**
 * Convert row values to appropriate types (boolean, date, number)
 * Optimized to reduce redundant type checking
 */
function convertRowTypes(row: GQueryRow, headers: string[]): GQueryRow {
  const newRow: GQueryRow = { __meta: row.__meta };
  
  headers.forEach((header) => {
    let value = row[header];
    
    // Skip empty values
    if (value === undefined || value === null || value === "") {
      newRow[header] = value;
      return;
    }
    
    // Only process string values for type conversion
    if (typeof value === "string") {
      const lowerValue = value.toLowerCase();
      
      // Check for boolean
      if (lowerValue === "true" || lowerValue === "false") {
        newRow[header] = lowerValue === "true";
        return;
      }
      
      // Check for date pattern (MM/DD/YYYY or MM/DD/YYYY HH:MM:SS)
      if (/^\d{1,2}\/\d{1,2}\/\d{4}(\s\d{1,2}:\d{1,2}(:\d{1,2})?)?$/.test(value)) {
        const dateValue = new Date(value);
        if (!isNaN(dateValue.getTime())) {
          newRow[header] = dateValue;
          return;
        }
      }
    }
    
    // Keep original value if no conversion applied
    newRow[header] = value;
  });
  
  return newRow;
}

export function getManyInternal(
  gquery: GQuery,
  sheetNames: string[],
  options?: GQueryReadOptions
): {
  [sheetName: string]: GQueryResult;
} {
  if (!sheetNames || sheetNames.length === 0) {
    return {};
  }

  const valueRenderOption =
    options?.valueRenderOption || ValueRenderOption.FORMATTED_VALUE;
  const dateTimeRenderOption =
    options?.dateTimeRenderOption || DateTimeRenderOption.FORMATTED_STRING;

  const result: { [sheetName: string]: GQueryResult } = {};

  // Fetch data using batchGet for better performance
  const dataResponse = callHandler(() =>
    Sheets.Spreadsheets.Values.batchGet(gquery.spreadsheetId, {
      ranges: sheetNames,
      valueRenderOption,
      dateTimeRenderOption,
    })
  );

  if (!dataResponse || !dataResponse.valueRanges) {
    sheetNames.forEach((sheet) => {
      result[sheet] = { headers: [], rows: [] };
    });
    return result;
  }

  dataResponse.valueRanges.forEach((valueRange, index) => {
    const sheetName = sheetNames[index];

    if (!valueRange.values || valueRange.values.length === 0) {
      result[sheetName] = { headers: [], rows: [] };
      return;
    }

    const headers = valueRange.values[0].map((h) => String(h));
    let rows = parseRows(headers, valueRange.values.slice(1));

    // Apply type conversion to rows
    rows = rows.map((row) => convertRowTypes(row, headers));

    result[sheetName] = { headers, rows };
  });

  return result;
}

export function getInternal(
  gqueryTableFactory: GQueryTableFactory,
  options?: GQueryReadOptions
): GQueryResult {
  const gqueryTable = gqueryTableFactory.gQueryTable;
  const gquery = gqueryTable.gquery;
  // Determine which sheets we need to read from
  const sheetsToRead = [gqueryTable.sheetName];

  // Add all join sheets
  if (gqueryTableFactory.joinOption.length > 0) {
    gqueryTableFactory.joinOption.forEach((join) => {
      if (!sheetsToRead.includes(join.sheetName)) {
        sheetsToRead.push(join.sheetName);
      }
    });
  }

  // Read data from all required sheets at once
  const results = gquery.getMany(sheetsToRead, options);

  // If the main sheet doesn't exist or has no data
  if (
    !results[gqueryTable.sheetName] ||
    results[gqueryTable.sheetName].rows.length === 0
  ) {
    return { headers: [], rows: [] };
  }

  // Get data for the primary table
  let result = results[gqueryTable.sheetName];
  let rows = result.rows;
  let headers = result.headers;

  // Process each join sequentially
  if (gqueryTableFactory.joinOption.length > 0) {
    gqueryTableFactory.joinOption.forEach((joinConfig) => {
      const { sheetName, sheetColumn, joinColumn, columnsToReturn } =
        joinConfig;

      const joinData = results[sheetName];

      if (!joinData || !joinData.rows || joinData.rows.length === 0) {
        return; // Skip this join
      }

      // Create join lookup table
      const joinMap: Record<string, any[]> = {};

      // Check if the join column exists in the join table
      const joinHeaders = joinData.headers;
      if (!joinHeaders.includes(sheetColumn)) {
        return; // Skip this join
      }

      joinData.rows.forEach((joinRow) => {
        const joinKey = String(joinRow[sheetColumn]);
        if (!joinMap[joinKey]) {
          joinMap[joinKey] = [];
        }
        joinMap[joinKey].push(joinRow);
      });

      // Perform the join operation
      rows = rows.map((row) => {
        const localJoinValue = row[joinColumn];
        const joinedRows = joinMap[String(localJoinValue)] || [];

        // Create joined row with all join table fields
        const joinedRow = { ...row };

        joinedRows.forEach((joinRow, index) => {
          // Determine which columns to include from join
          const columnsToInclude =
            columnsToReturn ||
            Object.keys(joinRow).filter(
              (key) => key !== "__meta" && key !== sheetColumn
            );

          columnsToInclude.forEach((key) => {
            if (joinRow.hasOwnProperty(key) && key !== "__meta") {
              // For multiple joined rows, add suffix _1, _2, etc.
              const suffix = joinedRows.length > 1 ? `_${index + 1}` : "";
              const targetKey = key === sheetColumn ? key : `${key}${suffix}`;
              joinedRow[targetKey] = joinRow[key];
            }
          });
        });

        return joinedRow;
      });
    });
  }

  // Apply filter if specified
  if (gqueryTableFactory.filterOption) {
    rows = rows.filter(gqueryTableFactory.filterOption);
  }

  // Apply select if specified
  if (
    gqueryTableFactory.selectOption &&
    gqueryTableFactory.selectOption.length > 0
  ) {
    // Create a map to track columns from joined tables
    const joinedColumns = new Set<string>();

    // Collect all columns from joined tables
    rows.forEach((row) => {
      Object.keys(row).forEach((key) => {
        // If the column is not in the original headers, it's from a join
        if (!headers.includes(key) && key !== "__meta") {
          joinedColumns.add(key);
        }
      });
    });

    // If we have a select option, determine which columns to keep
    let selectedHeaders: string[];

    // Check if any of the selected headers is "Model" or "Model_Name"
    // If we're selecting the join columns, we want to include all related joined fields
    if (
      gqueryTableFactory.selectOption.some(
        (header) =>
          header === "Model" ||
          header === "Model_Name" ||
          gqueryTableFactory.joinOption.some(
            (j) => j.joinColumn === header || j.sheetColumn === header
          )
      )
    ) {
      // Include all join-related columns and the selected columns
      selectedHeaders = [...gqueryTableFactory.selectOption];
      joinedColumns.forEach((joinCol) => {
        selectedHeaders.push(joinCol);
      });
    } else {
      // Otherwise only include explicitly selected columns
      selectedHeaders = [...gqueryTableFactory.selectOption];
    }

    // Remove duplicates
    selectedHeaders = [...new Set(selectedHeaders)];

    // Filter rows to only include selected columns
    rows = rows.map((row) => {
      const selectedRow: GQueryRow = {
        __meta: row.__meta,
      };

      selectedHeaders.forEach((header) => {
        if (row.hasOwnProperty(header)) {
          selectedRow[header] = row[header];
        }
      });

      return selectedRow;
    });

    // Update headers to include both selected and joined columns
    return {
      headers: selectedHeaders,
      rows,
    };
  }

  return {
    headers,
    rows,
  };
}

export function queryInternal(
  gqueryTable: GQueryTable,
  query: string
): GQueryResult {
  const sheet = gqueryTable.sheet;
  const range = sheet.getDataRange();
  
  // Build column name to letter mapping
  let replaced = query;
  const lastColumn = range.getLastColumn();
  
  for (let i = 0; i < lastColumn; i++) {
    const rng = sheet.getRange(1, i + 1);
    const name = rng.getValue();
    const letter = rng.getA1Notation().match(/([A-Z]+)/)?.[0];
    
    if (letter && name) {
      replaced = replaced.replaceAll(name, letter);
    }
  }

  // Build query URL
  const url = Utilities.formatString(
    "https://docs.google.com/spreadsheets/d/%s/gviz/tq?tq=%s&sheet=%s%s&headers=1",
    sheet.getParent().getId(),
    encodeURIComponent(replaced),
    sheet.getName(),
    typeof range === "string" ? "&range=" + range : ""
  );

  // Fetch with authorization
  const response = UrlFetchApp.fetch(url, {
    headers: {
      Authorization: "Bearer " + ScriptApp.getOAuthToken(),
    },
  });

  // Parse response
  const jsonResponse = JSON.parse(
    response
      .getContentText()
      .replace("/*O_o*/\n", "")
      .replace(/(google\.visualization\.Query\.setResponse\()|(\);)/gm, "")
  );
  
  const table = jsonResponse.table;

  // Extract column headers
  const headers = table.cols.map((col: any) => col.label);

  // Map rows to proper GQueryRow format
  const rows = table.rows.map((row: any) => {
    const rowObj: GQueryRow = {
      __meta: {
        rowNum: -1, // Query results don't have reliable row numbers
        colLength: row.c.length,
      },
    };

    // Populate row data
    table.cols.forEach((col: any, colIndex: number) => {
      const cellData = row.c[colIndex];
      let value: any = "";
      
      if (cellData) {
        // Use formatted value if available, otherwise use raw value
        value = cellData.f !== null && cellData.f !== undefined
          ? cellData.f
          : cellData.v;

        // Convert date strings if needed
        if (typeof value === "string" && 
            /^\d{1,2}\/\d{1,2}\/\d{4}(\s\d{1,2}:\d{1,2}(:\d{1,2})?)?$/.test(value)) {
          const dateValue = new Date(value);
          if (!isNaN(dateValue.getTime())) {
            value = dateValue;
          }
        }
      }
      
      rowObj[col.label] = value;
    });

    return rowObj;
  });

  return {
    headers,
    rows,
  };
}
