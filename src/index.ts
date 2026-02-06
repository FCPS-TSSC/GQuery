import { getInternal, getManyInternal, queryInternal } from "./get";
import { updateInternal } from "./update";
import { appendInternal } from "./append";
import { deleteInternal } from "./delete";
import { GQueryReadOptions, GQueryResult } from "./types";

export * from "./types";

/**
 * Main GQuery class for interacting with Google Sheets
 * Provides a query-like interface for reading and writing spreadsheet data
 */
export class GQuery {
  spreadsheetId: string;

  /**
   * Create a new GQuery instance
   * @param spreadsheetId Optional spreadsheet ID. If not provided, uses the active spreadsheet
   */
  constructor(spreadsheetId?: string) {
    this.spreadsheetId = spreadsheetId
      ? spreadsheetId
      : SpreadsheetApp.getActiveSpreadsheet().getId();
  }

  /**
   * Get a table reference for a specific sheet
   * @param sheetName Name of the sheet
   * @returns GQueryTable instance for chaining operations
   */
  from(sheetName: string): GQueryTable {
    return new GQueryTable(this, this.spreadsheetId, sheetName);
  }

  /**
   * Efficiently fetch data from multiple sheets at once
   * @param sheetNames Array of sheet names to fetch
   * @param options Optional rendering options
   * @returns Object mapping sheet names to their data
   */
  getMany(
    sheetNames: string[],
    options?: GQueryReadOptions
  ): {
    [sheetName: string]: GQueryResult;
  } {
    return getManyInternal(this, sheetNames, options);
  }
}

/**
 * Represents a single sheet table for query operations
 */
export class GQueryTable {
  gquery: GQuery;
  spreadsheetId: string;
  spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet;
  sheetName: string;
  sheet: GoogleAppsScript.Spreadsheet.Sheet;

  constructor(gquery: GQuery, spreadsheetId: string, sheetName: string) {
    this.spreadsheetId = spreadsheetId;
    this.sheetName = sheetName;
    this.spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    this.sheet = this.spreadsheet.getSheetByName(sheetName);
    this.gquery = gquery;
  }

  /**
   * Select specific columns to return
   * @param headers Array of column names to select
   * @returns GQueryTableFactory for chaining
   */
  select(headers: string[]): GQueryTableFactory {
    return new GQueryTableFactory(this).select(headers);
  }

  /**
   * Filter rows based on a condition
   * @param filterFn Function that returns true for rows to include
   * @returns GQueryTableFactory for chaining
   */
  where(filterFn: (row: any) => boolean): GQueryTableFactory {
    return new GQueryTableFactory(this).where(filterFn);
  }

  /**
   * Join with another sheet
   * @param sheetName Name of sheet to join with
   * @param sheetColumn Column in the joined sheet to match on
   * @param joinColumn Column in this sheet to match on
   * @param columnsToReturn Optional array of columns to return from joined sheet
   * @returns GQueryTableFactory for chaining
   */
  join(
    sheetName: string,
    sheetColumn: string,
    joinColumn: string,
    columnsToReturn?: string[]
  ): GQueryTableFactory {
    return new GQueryTableFactory(this).join(
      sheetName,
      sheetColumn,
      joinColumn,
      columnsToReturn
    );
  }

  /**
   * Update rows in the sheet
   * @param updateFn Function that receives a row and returns updated values
   * @returns GQueryResult with updated rows
   */
  update(
    updateFn: (row: Record<string, any>) => Record<string, any>
  ): GQueryResult {
    return new GQueryTableFactory(this).update(updateFn);
  }

  /**
   * Append new rows to the sheet
   * @param data Single object or array of objects to append
   * @returns GQueryResult with appended rows
   */
  append(
    data: { [key: string]: any }[] | { [key: string]: any }
  ): GQueryResult {
    const dataArray = Array.isArray(data) ? data : [data];
    return appendInternal(this, dataArray);
  }

  /**
   * Get data from the sheet
   * @param options Optional rendering options
   * @returns GQueryResult with rows and headers
   */
  get(options?: GQueryReadOptions): GQueryResult {
    return new GQueryTableFactory(this).get(options);
  }

  /**
   * Execute a Google Visualization API query
   * @param query Query string in Google Query Language
   * @returns GQueryResult with query results
   */
  query(query: string): GQueryResult {
    return queryInternal(this, query);
  }

  /**
   * Delete rows from the sheet
   * @returns Object with count of deleted rows
   */
  delete(): { deletedRows: number } {
    return new GQueryTableFactory(this).delete();
  }
}

/**
 * Factory class for building and executing queries with filters and joins
 */
export class GQueryTableFactory {
  gQueryTable: GQueryTable;
  selectOption?: string[];
  filterOption?: (row: any) => boolean;
  joinOption: {
    sheetName: string;
    sheetColumn: string;
    joinColumn: string;
    columnsToReturn?: string[];
  }[] = [];

  constructor(GQueryTable: GQueryTable) {
    this.gQueryTable = GQueryTable;
  }

  select(headers: string[]): GQueryTableFactory {
    this.selectOption = headers;
    return this;
  }

  where(filterFn: (row: any) => boolean): GQueryTableFactory {
    this.filterOption = filterFn;
    return this;
  }

  join(
    sheetName: string,
    sheetColumn: string,
    joinColumn: string,
    columnsToReturn?: string[]
  ): GQueryTableFactory {
    this.joinOption.push({
      sheetName,
      sheetColumn,
      joinColumn,
      columnsToReturn,
    });
    return this;
  }

  get(options?: GQueryReadOptions): GQueryResult {
    return getInternal(this, options);
  }

  update(
    updateFn: (row: Record<string, any>) => Record<string, any>
  ): GQueryResult {
    return updateInternal(this, updateFn);
  }

  append(
    data: { [key: string]: any }[] | { [key: string]: any }
  ): GQueryResult {
    const dataArray = Array.isArray(data) ? data : [data];
    return appendInternal(this.gQueryTable, dataArray);
  }

  delete(): { deletedRows: number } {
    return deleteInternal(this);
  }
}
