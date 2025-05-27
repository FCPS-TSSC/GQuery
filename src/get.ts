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

  // Use Sheets API to batch get the data
  const response = Sheets.Spreadsheets.Values.batchGet(gquery.spreadsheetId, {
    ranges: sheetNames,
    valueRenderOption: valueRenderOption,
    dateTimeRenderOption: dateTimeRenderOption,
  });

  const result: { [sheetName: string]: GQueryResult } = {};

  if (!response || !response.valueRanges) {
    return result;
  }

  // Process each returned value range
  response.valueRanges.forEach((valueRange, index) => {
    const sheetName = sheetNames[index];

    if (!valueRange.values || valueRange.values.length === 0) {
      // Handle empty sheet
      result[sheetName] = { headers: [], rows: [] };
      return;
    }

    // First row contains headers
    const headers = valueRange.values[0].map((header) => String(header));
    const rows: GQueryRow[] = [];

    // Process data rows (starting from index 1 to skip headers)
    for (let i = 1; i < valueRange.values.length; i++) {
      const rowData = valueRange.values[i];
      const row: GQueryRow = {
        __meta: {
          rowNum: i + 1, // 1-based row number (+1 because we're starting from index 1)
          colLength: rowData.length,
        },
      };

      // Map each column value to its corresponding header
      for (let j = 0; j < headers.length; j++) {
        const header = headers[j];
        row[header] = j < rowData.length ? rowData[j] : null;
      }

      rows.push(row);
    }

    result[sheetName] = { headers, rows };
  });

  return result;
}

export function getInternal(
  gqueryTableFactory: GQueryTableFactory
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
  const results = gquery.getMany(sheetsToRead);

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
