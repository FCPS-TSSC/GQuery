import { GQuery, GQueryTable, GQueryTableFactory } from "./index";
import { callHandler } from "./ratelimit";
import {
  GQueryReadOptions,
  GQueryResult,
  ValueRenderOption,
  DateTimeRenderOption,
  GQueryRow,
} from "./types";
import {
  mapRowToObject,
  applyDataTypeConversion,
  createJoinLookup,
  handleError
} from "./utils";

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

  // Set default options if not provided
  const valueRenderOption =
    options?.valueRenderOption || ValueRenderOption.FORMATTED_VALUE;
  const dateTimeRenderOption =
    options?.dateTimeRenderOption || DateTimeRenderOption.FORMATTED_STRING;

  const result: { [sheetName: string]: GQueryResult } = {};

  // Optimize: Get data for all sheets in a single batch call including headers
  // This reduces API calls from 2*n to 1 call
  const dataRanges = sheetNames.map((sheet) => `${sheet}`);
  const dataResponse = callHandler(() =>
    Sheets.Spreadsheets.Values.batchGet(gquery.spreadsheetId, {
      ranges: dataRanges,
      valueRenderOption: valueRenderOption,
      dateTimeRenderOption: dateTimeRenderOption,
    })
  );

  if (!dataResponse || !dataResponse.valueRanges) {
    // Return empty results for all sheets
    sheetNames.forEach((sheet) => {
      result[sheet] = { headers: [], rows: [] };
    });
    return result;
  }

  // Get spreadsheet metadata for data types (single API call)
  let sheetMetadata: { [sheetName: string]: { [header: string]: string } } = {};
  try {
    const metadataResponse = callHandler(() =>
      Sheets.Spreadsheets.get(gquery.spreadsheetId, {
        fields: "sheets(properties(title),tables.columnProperties)",
      })
    );

    if (metadataResponse && metadataResponse.sheets) {
      metadataResponse.sheets.forEach((sheet) => {
        const sheetName = sheet.properties?.title;
        if (!sheetName || !sheetNames.includes(sheetName)) return;

        // @ts-expect-error: TypeScript may not recognize the tables property
        if (sheet.tables && sheet.tables.length > 0) {
          const table = sheet.tables[0];
          if (table.columnProperties) {
            sheetMetadata[sheetName] = {};
            Object.keys(table.columnProperties).forEach((column) => {
              const dataType = table.columnProperties[column].dataType;
              if (dataType) {
                sheetMetadata[sheetName][column] = dataType;
              }
            });
          }
        }
      });
    }
  } catch (e) {
    handleError("fetching metadata", e);
  }

  // Process each value range from the batch response
  dataResponse.valueRanges.forEach((valueRange, index) => {
    const sheetName = sheetNames[index];

    if (!valueRange.values || valueRange.values.length === 0) {
      // Sheet exists but has no data
      result[sheetName] = { headers: [], rows: [] };
      return;
    }

    // Extract headers from first row
    const headers = valueRange.values[0].map((header) => String(header));
    
    if (valueRange.values.length === 1) {
      // Only headers, no data rows
      result[sheetName] = { headers, rows: [] };
      return;
    }

    const columnTypes = sheetMetadata[sheetName] || {};
    const dataRows = valueRange.values.slice(1);

    // Use the utility function to map rows
    const rows: GQueryRow[] = dataRows.map((rowData, rowIndex) => {
      const row = mapRowToObject(rowData, headers, rowIndex, true);
      
      // Apply metadata-based type conversions
      if (Object.keys(columnTypes).length > 0) {
        headers.forEach((header) => {
          if (columnTypes[header] && row[header] !== "") {
            row[header] = applyDataTypeConversion(row[header], columnTypes[header]);
          }
        });
      }
      
      return row;
    });

    result[sheetName] = { headers, rows };
  });

  // Ensure all requested sheets have an entry in result
  sheetNames.forEach((sheet) => {
    if (!result[sheet]) {
      result[sheet] = { headers: [], rows: [] };
    }
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

      // Create join lookup table using utility function
      const joinMap = createJoinLookup(joinData.rows, sheetColumn);

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
  var sheet = gqueryTable.sheet;
  var range = sheet.getDataRange();
  var replaced = query;
  for (var i = 0; i < range.getLastColumn() - 1; i++) {
    var rng = sheet.getRange(1, i + 1);

    var name = rng.getValue();
    var letter = rng.getA1Notation().match(/([A-Z]+)/)[0];
    replaced = replaced.replaceAll(name, letter);
  }

  var response = UrlFetchApp.fetch(
    Utilities.formatString(
      "https://docs.google.com/spreadsheets/d/%s/gviz/tq?tq=%s%s%s%s",
      sheet.getParent().getId(),
      encodeURIComponent(replaced),
      "&sheet=" + sheet.getName(),
      typeof range === "string" ? "&range=" + range : "",
      "&headers=1"
    ),
    {
      headers: {
        Authorization: "Bearer " + ScriptApp.getOAuthToken(),
      },
    }
  );

  try {
    var jsonResponse = JSON.parse(
        response
          .getContentText()
          .replace("/*O_o*/\n", "")
          .replace(/(google\.visualization\.Query\.setResponse\()|(\);)/gm, "")
      ),
      table = jsonResponse.table;
  } catch (e) {
    handleError("parsing query response", e);
    return { headers: [], rows: [] };
  }

  // Extract column headers
  const headers = table.cols.map((col: any) => col.label);

  // Map rows to proper GQueryRow format
  const rows = table.rows.map((row: any, _rowIndex: number) => {
    const rowObj: GQueryRow = {
      __meta: {
        rowNum: -1, // +2 because we're starting from index 0 and row 1 is headers
        colLength: row.c.length,
      },
    };

    // Initialize all header fields to empty strings
    headers.forEach((header: string) => {
      rowObj[header] = "";
    });

    // Populate row data
    table.cols.forEach((col: any, colIndex: number) => {
      const cellData = row.c[colIndex];
      if (cellData) {
        // Use formatted value if available, otherwise use raw value
        let value =
          cellData.f !== null && cellData.f !== undefined
            ? cellData.f
            : cellData.v;

        // Convert known data types
        if (value instanceof Date) {
          // Keep as Date object
        } else if (typeof value === "string") {
          // Try to auto-detect date strings
          if (
            /^\d{1,2}\/\d{1,2}\/\d{4}(\s\d{1,2}:\d{1,2}(:\d{1,2})?)?$/.test(
              value
            )
          ) {
            try {
              const dateValue = new Date(value);
              if (!isNaN(dateValue.getTime())) {
                value = dateValue;
              }
            } catch (e) {
              // Keep as string if conversion fails
            }
          }
        }

        rowObj[col.label] = value;
      }
    });

    return rowObj;
  });

  // Return in the standard GQueryResult format
  return {
    headers: headers,
    rows: rows,
  };
}
