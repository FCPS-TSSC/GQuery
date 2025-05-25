declare namespace GQuery {
  type GQueryReadJoin = {
      sheets: string[];
      where?: (row: Record<string, any>) => boolean | Record<string, any>;
  };
  type GQueryReadOptions = {
      filter?: GQueryFilter;
      join?: GQueryReadJoin;
      valueRenderOption?: ValueRenderOption;
      dateTimeRenderOption?: DateTimeRenderOption;
  };
  type GQueryReadData = {
      headers: string[];
      values: Record<string, any>[];
  };
  declare enum ValueRenderOption {
      FORMATTED_VALUE = "FORMATTED_VALUE",
      UNFORMATTED_VALUE = "UNFORMATTED_VALUE",
      FORMULA = "FORMULA"
  }
  declare enum DateTimeRenderOption {
      FORMATTED_STRING = "FORMATTED_STRING",
      SERIAL_NUMBER = "SERIAL_NUMBER"
  }
  
  declare class GQuery {
      spreadsheetId: string;
      constructor(spreadsheetId?: string);
      read(sheetName: string, options?: GQueryReadOptions): GQueryReadData;
      readMany(sheetNames: string[]): void;
  }
  type GQueryFilter = (row: any) => boolean;
  
  export { GQuery };
  export type { GQueryFilter };
  
}
declare var GQuery: typeof GQuery;
