/**
 * Standard Schema V1 interface
 * @see https://standardschema.dev
 *
 * Copied verbatim from the spec — no runtime dependency.
 * Any schema library that implements this interface (Zod, Valibot, ArkType, etc.)
 * can be passed directly to GQuery.from() for type inference and optional validation.
 */
export interface StandardSchemaV1<Input = unknown, Output = unknown> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) =>
      | StandardSchemaV1.Result<Output>
      | Promise<StandardSchemaV1.Result<Output>>;
    readonly types?: StandardSchemaV1.Types<Input, Output> | undefined;
  };
}

export declare namespace StandardSchemaV1 {
  type Result<Output> = SuccessResult<Output> | FailureResult;

  interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }

  interface FailureResult {
    readonly issues: ReadonlyArray<Issue>;
  }

  interface Issue {
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }

  interface PathSegment {
    readonly key: PropertyKey;
  }

  interface Types<Input, Output> {
    readonly input: Input;
    readonly output: Output;
  }
}

/**
 * Infer the output type from a StandardSchemaV1-compatible schema.
 * Falls back to Record<string, unknown> if S is not a Standard Schema.
 *
 * @example
 * const schema = z.object({ name: z.string() });
 * type Row = InferSchema<typeof schema>; // { name: string }
 */
export type InferSchema<S> = S extends StandardSchemaV1<any, infer O>
  ? O
  : Record<string, unknown>;

/**
 * Options for reading data from Google Sheets
 */
export type GQueryReadOptions = {
  /** How values should be rendered in the output */
  valueRenderOption?: ValueRenderOption;
  /** How dates and times should be rendered in the output */
  dateTimeRenderOption?: DateTimeRenderOption;
  /**
   * When true, each row is parsed through the table's schema (if set).
   * Throws a GQuerySchemaError if validation fails.
   * Defaults to false (schema is used for type inference only).
   */
  validate?: boolean;
};

/**
 * Result structure returned by GQuery operations
 */
export type GQueryResult<T = Record<string, any>> = {
  /** Array of row objects typed to T */
  rows: GQueryRow<T>[];
  /** Column headers from the sheet */
  headers: string[];
};

/**
 * A single row with metadata about its position in the sheet.
 * T is the shape of the data columns; __meta is always present alongside them.
 */
export type GQueryRow<T = Record<string, any>> = T & {
  __meta: {
    /** 1-based row number in the sheet (row 1 is headers) */
    rowNum: number;
    /** Number of columns in the row */
    colLength: number;
  };
};

/**
 * How values should be rendered in the output
 * @see https://developers.google.com/sheets/api/reference/rest/v4/ValueRenderOption
 */
export enum ValueRenderOption {
  /** Values will be calculated and formatted according to cell formatting */
  FORMATTED_VALUE = "FORMATTED_VALUE",
  /** Values will be calculated but not formatted */
  UNFORMATTED_VALUE = "UNFORMATTED_VALUE",
  /** Values will not be calculated; formulas will be returned as-is */
  FORMULA = "FORMULA",
}

/**
 * How dates and times should be rendered in the output
 * @see https://developers.google.com/sheets/api/reference/rest/v4/DateTimeRenderOption
 */
export enum DateTimeRenderOption {
  /** Dates and times will be rendered as strings according to cell formatting */
  FORMATTED_STRING = "FORMATTED_STRING",
  /** Dates and times will be rendered as serial numbers */
  SERIAL_NUMBER = "SERIAL_NUMBER",
}

/**
 * Thrown when a row fails schema validation.
 */
export class GQuerySchemaError extends Error {
  constructor(
    public readonly issues: ReadonlyArray<StandardSchemaV1.Issue>,
    public readonly row: Record<string, any>,
  ) {
    super(
      `GQuery schema validation failed: ${issues.map((i) => i.message).join("; ")}`,
    );
    this.name = "GQuerySchemaError";
  }
}
