declare namespace GQuery {
  type GQueryReadJoin = {
      on?: Record<string, string>;
      include?: string[];
  };
  type GQueryReadOptions = {
      filter?: GQueryFilter;
      join?: Record<string, GQueryReadJoin>;
      valueRenderOption?: ValueRenderOption;
      dateTimeRenderOption?: DateTimeRenderOption;
  };
  type GQueryReadData = {
      headers: string[];
      values: Row[];
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
      readMany(sheetNames: string[], options?: GQueryReadOptions): Record<string, GQueryReadData>;
      update(sheetName: string, data: Row[]): void;
  }
  type GQueryFilter = (row: any) => boolean;
  type Row = Record<string, any> & {
      __meta: {
          rowNum: number;
          colLength: number;
      };
  };
  
  export { GQuery };
  export type { GQueryFilter, Row };
  
}
declare var GQuery: typeof GQuery;
