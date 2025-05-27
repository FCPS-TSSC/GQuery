import { getInternal, getManyInternal, queryInternal } from "./get";
import { updateInternal } from "./update";
import { appendInternal } from "./append";
import { deleteInternal } from "./delete";
import { GQueryReadOptions, GQueryResult } from "./types";

export * from "./types";

export class GQuery {
  spreadsheetId: string;

  constructor(spreadsheetId?: string) {
    this.spreadsheetId = spreadsheetId
      ? spreadsheetId
      : SpreadsheetApp.getActiveSpreadsheet().getId();
  }

  from(sheetName: string): GQueryTable {
    return new GQueryTable(this, this.spreadsheetId, sheetName);
  }

  getMany(
    sheetNames: string[],
    options?: GQueryReadOptions
  ): {
    [sheetName: string]: GQueryResult;
  } {
    return getManyInternal(this, sheetNames, options);
  }
}

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

  select(headers: string[]): GQueryTableFactory {
    return new GQueryTableFactory(this).select(headers);
  }

  where(filterFn: (row: any) => boolean): GQueryTableFactory {
    return new GQueryTableFactory(this).where(filterFn);
  }

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

  update(
    updateFn: (row: Record<string, any>) => Record<string, any>
  ): GQueryResult {
    return new GQueryTableFactory(this).update(updateFn);
  }

  append(
    data: { [key: string]: any }[] | { [key: string]: any }
  ): GQueryResult {
    // Handle single object by wrapping it in an array
    const dataArray = Array.isArray(data) ? data : [data];
    return appendInternal(this, dataArray);
  }

  get(options?: GQueryReadOptions): GQueryResult {
    return new GQueryTableFactory(this).get(options);
  }

  query(query: string): GQueryResult {
    return queryInternal(this, query);
  }

  delete(): { deletedRows: number } {
    return new GQueryTableFactory(this).delete();
  }
}

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
    // Handle single object by wrapping it in an array
    const dataArray = Array.isArray(data) ? data : [data];
    return appendInternal(this.gQueryTable, dataArray);
  }

  delete(): { deletedRows: number } {
    return deleteInternal(this);
  }
}
