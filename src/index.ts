import { GQueryReadOptions, readImplementation } from "./read";

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

  readMany(sheetNames: string[]) {
    // TODO:
  }
}

export type GQueryFilter = (row: any) => boolean;
