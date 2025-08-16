import { GQueryTableFactory } from "./index";
import { callHandler } from "./ratelimit";
import { GQueryResult, GQueryRow } from "./types";
import { fetchSheetData } from "./utils";

export function updateInternal(
  gQueryTableFactory: GQueryTableFactory,
  updateFn: (row: Record<string, any>) => Record<string, any>
): GQueryResult {
  const spreadsheetId = gQueryTableFactory.gQueryTable.spreadsheetId;
  const sheetName = gQueryTableFactory.gQueryTable.sheetName;
  const range = sheetName;

  const { headers, rows } = fetchSheetData(spreadsheetId, range);

  if (headers.length === 0) {
    return { rows: [], headers: [] };
  }

  const filteredRows = gQueryTableFactory.filterOption
    ? rows.filter((row) => {
        try {
          return gQueryTableFactory.filterOption!(row);
        } catch (error) {
          console.error("Error filtering row:", error);
          return false;
        }
      })
    : rows;

  const updatedRows: GQueryRow[] = filteredRows.map((row) => {
    const updatedRow: GQueryRow = { ...row };
    try {
      // Allow the updateFn to mutate the provided row object directly or
      // return a partial set of properties to merge.
      const result = updateFn(updatedRow);
      if (result && typeof result === "object") {
        Object.assign(updatedRow, result);
      }
    } catch (error) {
      console.error("Error updating row:", error);
    }
    return updatedRow;
  });

  const changedCells = new Map<string, any[]>();

  updatedRows.forEach((updatedRow) => {
    const rowIndex = updatedRow.__meta.rowNum - 2;
    const originalRow = rows[rowIndex];

    headers.forEach((header, columnIndex) => {
      let updatedValue = updatedRow[header];

      if (updatedValue instanceof Date) {
        updatedValue = updatedValue.toLocaleString();
      }

      if (originalRow[header] === updatedValue) return;

      if (
        updatedValue !== undefined &&
        updatedValue !== null &&
        updatedValue !== ""
      ) {
        const columnLetter = getColumnLetter(columnIndex);
        const cellRange = `${sheetName}!${columnLetter}${updatedRow.__meta.rowNum}`;
        changedCells.set(cellRange, [[updatedValue]]);
      } else if (
        originalRow[header] === "" ||
        originalRow[header] === undefined ||
        originalRow[header] === null
      ) {
        const columnLetter = getColumnLetter(columnIndex);
        const cellRange = `${sheetName}!${columnLetter}${updatedRow.__meta.rowNum}`;
        changedCells.set(cellRange, [[updatedValue || ""]]);
      }
    });
  });

  if (changedCells.size > 0) {
    const optimizedUpdates = optimizeRanges(changedCells);

    const batchUpdateRequest = {
      data: optimizedUpdates,
      valueInputOption: "USER_ENTERED",
    };

    callHandler(() =>
      Sheets.Spreadsheets.Values.batchUpdate(batchUpdateRequest, spreadsheetId)
    );
  }

  return {
    rows: filteredRows.length > 0 ? updatedRows : [],
    headers,
  };
}

/**
 * Convert column index to column letter (0 -> A, 1 -> B, etc.)
 */
function getColumnLetter(columnIndex: number): string {
  let columnLetter = "";
  let index = columnIndex;

  while (index >= 0) {
    columnLetter = String.fromCharCode(65 + (index % 26)) + columnLetter;
    index = Math.floor(index / 26) - 1;
  }

  return columnLetter;
}

/**
 * Optimize update ranges by combining adjacent cells in the same column
 * into contiguous row segments.
 */
function optimizeRanges(
  changedCells: Map<string, any[]>
): { range: string; values: any[][] }[] {
  const columnGroups = new Map<string, Map<number, any>>();

  for (const [cellRange, value] of changedCells.entries()) {
    const matches = cellRange.match(/([^!]+)!([A-Z]+)(\d+)$/);
    if (!matches) continue;

    const sheet = matches[1];
    const columnLetter = matches[2];
    const rowNumber = parseInt(matches[3], 10);
    const columnKey = `${sheet}!${columnLetter}`;

    if (!columnGroups.has(columnKey)) {
      columnGroups.set(columnKey, new Map());
    }
    columnGroups.get(columnKey)!.set(rowNumber, value[0][0]);
  }

  const optimizedUpdates: { range: string; values: any[][] }[] = [];

  for (const [columnKey, rowsMap] of columnGroups.entries()) {
    const rowNumbers = Array.from(rowsMap.keys()).sort((a, b) => a - b);
    if (rowNumbers.length === 0) continue;

    const [sheet, column] = columnKey.split("!");

    let start = rowNumbers[0];
    let groupValues: any[][] = [[rowsMap.get(start)]];

    for (let i = 1; i < rowNumbers.length; i++) {
      const rowNum = rowNumbers[i];
      const prev = rowNumbers[i - 1];
      if (rowNum === prev + 1) {
        groupValues.push([rowsMap.get(rowNum)]);
      } else {
        const end = prev;
        const rangeKey =
          start === end
            ? `${sheet}!${column}${start}`
            : `${sheet}!${column}${start}:${column}${end}`;
        optimizedUpdates.push({ range: rangeKey, values: groupValues });
        start = rowNum;
        groupValues = [[rowsMap.get(rowNum)]];
      }
    }

    const last = rowNumbers[rowNumbers.length - 1];
    const rangeKey =
      start === last
        ? `${sheet}!${column}${start}`
        : `${sheet}!${column}${start}:${column}${last}`;
    optimizedUpdates.push({ range: rangeKey, values: groupValues });
  }

  return optimizedUpdates;
}
