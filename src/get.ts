import {
  DateTimeRenderOption,
  GQuery,
  GQueryReadOptions,
  GQueryResult,
  GQueryRow,
  GQueryTable,
  GQueryTableFactory,
  ValueRenderOption,
} from "./index";

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
  const headersMap: { [sheetName: string]: string[] } = {};

  // Step 1: Get headers for each sheet (row 1)
  for (const sheetName of sheetNames) {
    try {
      const headerResponse = Sheets.Spreadsheets.Values.get(
        gquery.spreadsheetId,
        `${sheetName}!1:1`,
        {
          valueRenderOption: valueRenderOption,
          dateTimeRenderOption: dateTimeRenderOption,
        }
      );

      if (
        !headerResponse ||
        !headerResponse.values ||
        headerResponse.values.length === 0
      ) {
        // Handle empty sheet or sheet with no headers
        result[sheetName] = { headers: [], rows: [] };
        continue;
      }

      headersMap[sheetName] = headerResponse.values[0].map((header) =>
        String(header)
      );
    } catch (e) {
      console.error(`Error fetching headers for sheet ${sheetName}:`, e);
      result[sheetName] = { headers: [], rows: [] };
    }
  }

  // Step 2: Get data for sheets that have headers
  const sheetsToFetch = Object.keys(headersMap).filter(
    (sheet) => headersMap[sheet].length > 0
  );

  if (sheetsToFetch.length === 0) {
    return result;
  }

  // Also fetch metadata for each sheet to determine data types
  let sheetMetadata: { [sheetName: string]: { [header: string]: string } } = {};

  try {
    // Get spreadsheet metadata including sheet tables if available
    const metadataResponse = Sheets.Spreadsheets.get(gquery.spreadsheetId, {
      fields: "sheets(properties(title),tables.columnProperties)",
    });

    if (metadataResponse && metadataResponse.sheets) {
      metadataResponse.sheets.forEach((sheet) => {
        const sheetName = sheet.properties?.title;
        if (!sheetName || !sheetsToFetch.includes(sheetName)) return;

        // @ts-expect-error: TypeScript may not recognize the tables property
        if (sheet.tables && sheet.tables.length > 0) {
          // Use the first table definition for column properties
          // @ts-expect-error: TypeScript may not recognize the tables property
          const table = sheet.tables[0];
          if (table.columnProperties) {
            sheetMetadata[sheetName] = {};

            // For each column property, store its data type
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
    console.error("Error fetching metadata:", e);
    // Continue without metadata - types won't be converted
  }

  // Batch get data for all sheets (just use the sheet name as the range)
  const dataRanges = sheetsToFetch.map((sheet) => `${sheet}`);
  const dataResponse = Sheets.Spreadsheets.Values.batchGet(
    gquery.spreadsheetId,
    {
      ranges: dataRanges,
      valueRenderOption: valueRenderOption,
      dateTimeRenderOption: dateTimeRenderOption,
    }
  );

  if (!dataResponse || !dataResponse.valueRanges) {
    // Return just the headers if we couldn't get any data
    sheetsToFetch.forEach((sheet) => {
      result[sheet] = {
        headers: headersMap[sheet],
        rows: [],
      };
    });
    return result;
  }

  // Process each value range from the batch response
  dataResponse.valueRanges.forEach((valueRange, index) => {
    const sheetName = sheetsToFetch[index];
    const headers = headersMap[sheetName];

    if (!valueRange.values || valueRange.values.length === 0) {
      // Sheet exists but has no data rows
      result[sheetName] = { headers, rows: [] };
      return;
    }

    const rows: GQueryRow[] = [];
    const columnTypes = sheetMetadata[sheetName] || {};

    // Process data rows
    valueRange.values.forEach((rowData, rowIndex) => {
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

        // Apply type conversions based on metadata if available
        if (columnTypes[header] && value !== "") {
          const dataType = columnTypes[header];

          if (dataType === "BOOLEAN") {
            // Convert to boolean
            if (typeof value === "string") {
              value = value.toLowerCase() === "true";
            }
          } else if (dataType === "DATE_TIME") {
            // Convert to Date object
            try {
              const dateValue = new Date(value);
              if (!isNaN(dateValue.getTime())) {
                value = dateValue;
              }
            } catch (e) {
              // Keep original value if conversion fails
            }
          } else if (dataType === "NUMBER") {
            // Convert to number
            const numValue = Number(value);
            if (!isNaN(numValue)) {
              value = numValue;
            }
          }
        } else {
          // Try automatic type inference for common patterns
          if (typeof value === "string") {
            // Auto-detect booleans
            if (
              value.toLowerCase() === "true" ||
              value.toLowerCase() === "false"
            ) {
              value = value.toLowerCase() === "true";
            }
            // Auto-detect dates (simple pattern for dates like MM/DD/YYYY, etc.)
            else if (
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
        }

        row[header] = value;
      }

      rows.push(row);
    });

    result[sheetName] = { headers, rows };
  });

  // Make sure all sheets in headersMap have an entry in result
  sheetsToFetch.forEach((sheet) => {
    if (!result[sheet]) {
      result[sheet] = {
        headers: headersMap[sheet],
        rows: [],
      };
    }
  });

  // Convert data types based on metadata if available
  if (Object.keys(sheetMetadata).length > 0) {
    Object.keys(result).forEach((sheetName) => {
      const sheetResult = result[sheetName];
      const metadata = sheetMetadata[sheetName];

      if (sheetResult && sheetResult.rows && metadata) {
        sheetResult.rows = sheetResult.rows.map((row) => {
          const newRow = { ...row };

          Object.keys(metadata).forEach((column) => {
            const dataType = metadata[column];

            // Convert based on data type
            if (dataType === "NUMBER") {
              newRow[column] = Number(row[column]);
            } else if (dataType === "BOOLEAN") {
              newRow[column] = row[column] === "TRUE";
            } else if (dataType === "DATE" || dataType === "DATETIME") {
              newRow[column] = new Date(row[column]);
            }
            // Add more conversions as needed
          });

          return newRow;
        });
      }
    });
  }

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
