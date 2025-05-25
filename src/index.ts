import {
  GQueryReadOptions,
  readImplementation,
  readManyImplementation,
} from "./read";

export class GQuery {
  spreadsheetId: string;

  constructor(spreadsheetId?: string) {
    this.spreadsheetId = spreadsheetId
      ? spreadsheetId
      : SpreadsheetApp.getActiveSpreadsheet().getId();
  }

  //   create(sheetName: string, data: any[]) {
  //     // TODO:
  //   }

  read(sheetName: string, options?: GQueryReadOptions) {
    return readImplementation(this.spreadsheetId, sheetName, options);
  }

  readMany(sheetNames: string[], options?: GQueryReadOptions) {
    return readManyImplementation(this.spreadsheetId, sheetNames, options);
  }

  update(sheetName: string, data: Row[]) {}
}

export type GQueryFilter = (row: any) => boolean;

export type Row = Record<string, any> & {
  __meta: {
    rowNum: number;
    colLength: number;
  };
};
