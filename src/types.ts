export type GQueryReadOptions = {
  valueRenderOption?: ValueRenderOption;
  dateTimeRenderOption?: DateTimeRenderOption;
};
export type GQueryResult = {
  rows: GQueryRow[];
  headers: string[];
};
export type GQueryRow = Record<string, any> & {
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
