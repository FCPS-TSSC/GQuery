import {
  GQueryReadOptions,
  readImplementation,
  readManyImplementation,
} from "./read";
import { GQueryUpdateOptions, updateImplementation } from "./update";
import {
  GQueryCreateOptions,
  createImplementation,
  CreateResult,
} from "./create";

export class GQuery {
  spreadsheetId: string;

  constructor(spreadsheetId?: string) {
    this.spreadsheetId = spreadsheetId
      ? spreadsheetId
      : SpreadsheetApp.getActiveSpreadsheet().getId();
  }

  create(
    sheetName: string,
    data: Record<string, any>[],
    options?: GQueryCreateOptions
  ): CreateResult {
    return createImplementation(this.spreadsheetId, sheetName, data, options);
  }

  read(sheetName: string, options?: GQueryReadOptions) {
    return readImplementation(this.spreadsheetId, sheetName, options);
  }

  readMany(sheetNames: string[], options?: GQueryReadOptions) {
    return readManyImplementation(this.spreadsheetId, sheetNames, options);
  }

  update(sheetName: string, data: Row[], options?: GQueryUpdateOptions) {
    return updateImplementation(this.spreadsheetId, sheetName, data, options);
  }
}

export type GQueryFilter = (row: any) => boolean;

export type Row = Record<string, any> & {
  __meta: {
    rowNum: number;
    colLength: number;
  };
};

export enum ValueRenderOption {
  FORMATTED_VALUE = "FORMATTED_VALUE",
  UNFORMATTED_VALUE = "UNFORMATTED_VALUE",
  FORMULA = "FORMULA",
}

export enum DateTimeRenderOption {
  FORMATTED_STRING = "FORMATTED_STRING",
  SERIAL_NUMBER = "SERIAL_NUMBER",
}
