# GQuery

Yet another Google Sheets ORM for Apps Script, supporting advanced features like joins, Query Visualization Language, and the Advanced Sheet Service. Inspired by [vlucas' sheetquery](https://github.com/vlucas/sheetquery).

## Index

- [Ways to Install](#ways-to-install)
  - [(Recommended) As a NPM Package](#recommended-as-a-npm-package)
  - [As an Apps Script Library](#as-an-apps-script-library)
  - [As a Standalone Script](#as-a-standalone-script)
- [Usage](#usage)
  - [Using GET](#using-get)
  - [Using GET MANY](#using-get-many)
  - [Using QUERY](#using-query)
  - [Using UPDATE](#using-update)
  - [Using APPEND](#using-append)
  - [Using DELETE](#using-delete)
  - [Using JOINS](#using-joins)
- [Benchmarking Performance](#benchmarking-performance)

## Ways to Install

#### (Recommended) As a NPM Package

If you use a build toolchain in your Apps Script project, like Rollup or Vite, this is the preferred installation method.

- To install via the command line: `npm install @FCPS-TSSC/gquery@1.4.0`
- To add in your `package.json` dependencies: `"@FCPS-TSSC/gquery": "1.4.0"`

You'll call the GQuery class via `new GQuery()`

#### As an Apps Script Library

For traditional Apps Script projects, it is possible to import the Apps Script code as a library.

1. Go to your project editor and press the plus button next to "Libraries"
2. Enter the following script ID: `1UqTjUrX6rnMMzbYJPJRPk3cmLCYc7n7FZwZq6Q7gG-j3rTqj15LC953B` Then press Look up
3. Select a version, _generally_ you will want to choose the latest pinned release. (The highest number that isn't HEAD) The development branch can sometimes be unstable.
4. Change the identifier if desired, press Add.

You'll call the GQuery class via `new GQuery.GQuery()` (The first GQuery is your identifier)

#### As a Standalone Script

You can also copy and paste the code from `dist/bundle.global.js` directly into your Apps Script project as a standalone script file. It is recommended to go to a tag release and copy from there to ensure stability. (ex. v1.4.0) The file type does not matter and can be placed in a .gs file without issue.

You'll call the GQuery class via `new GQuery.GQuery()` (The first GQuery is your identifier)

## Usage

This chart shows a quick overview of the different functions GQuery offers.

| Function                    | Description                                                                                                                                                                    | .from() | .select() | .where() | .join() |
| :-------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-----: | :-------: | :------: | :-----: |
| [GET](#using-get)           | Retrieve row(s) in a single sheet.                                                                                                                                             |    Y    |     Y     |    Y     |    Y    |
| [GET MANY](#using-get-many) | Retrieve rows from multiple sheets.                                                                                                                                            |    N    |     N     |    N     |    N    |
| [QUERY](#using-query)       | Retrieve data from a single sheet via the Google's [Query Visualization Language](https://developers.google.com/chart/interactive/docs/querylanguage#case-sensitivityhttps:/). |    Y    |     Y     |    Y     |    Y    |
| [UPDATE](#using-update)     | Update rows in a single sheet.                                                                                                                                                 |    Y    |     Y     |    Y     |    Y    |
| [APPEND](#using-append)     | Add rows to a single sheet.                                                                                                                                                    |    Y    |     Y     |    Y     |    Y    |
| [DELETE](#using-delete)     | Delete rows from a single sheet.                                                                                                                                               |    Y    |     Y     |    Y     |    Y    |

Modifier Functions

| Function             | Description                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FROM                 | Used to select the target sheet for all following queries. Returns a GQueryTable.                                                                                |
| SELECT               | Used to select specific columns to return. Returns a GQueryTableFactory.                                                                                         |
| WHERE                | Used to filter rows based on a condition. Returns a GQueryTableFactory.                                                                                          |
| [JOIN](#using-joins) | Used to join with another sheet based on the sheet's column, a join column, and allows a selection of different columns to return. Returns a GQueryTableFactory. |

#### Using GET

Using GET requires that you first specify a sheet to query with the .from() function, then you can optionally specify columns to return with .select() and filter rows with .where(). Optionally, .join() can be used to include columns from other sheets. Finally, you call .get() to execute the query and return the results.

```javascript
const gq = new GQuery();
const result = gq
  .from("Sheet1")
  .select("Name", "Age")
  .where((row) => row.Age > 18)
  .get();
```

```json
{
  "headers": ["Name", "Age"],
  "rows": [
    { "Name": "Alice", "Age": 30 },
    { "Name": "Bob", "Age": 25 }
  ]
}
```

#### Using GET MANY

GET MANY allows you to retrieve data from multiple sheets in a single query. You specify the sheets and then call .getMany() to execute the query.

```javascript
const gq = new GQuery();
const result = gq.getMany(["Buildings", "Rooms"]);
```

```json
{
  "Buildings": {
    "headers": ["Building Name", "Address"],
    "rows": [
      { "Building Name": "Library", "Address": "123 Main St" },
      { "Building Name": "Gym", "Address": "456 Elm St" }
    ]
  },
  "Rooms": {
    "headers": ["Room Number", "Capacity"],
    "rows": [
      { "Room Number": "101", "Capacity": 30 },
      { "Room Number": "102", "Capacity": 20 }
    ]
  }
}
```

#### Using QUERY

QUERY allows you to use Google's Query Visualization Language to retrieve data from a sheet. You specify the sheet and the query string, then call .query() to execute. This is often faster than using the modifier functions and can be more concise for complex queries, but it does not support joins or multiple sheets. It is also read-only.

```javascript
const gq = new GQuery();
const result = gq.from("Sheet1").query("SELECT Name, Age WHERE Age > 18");
```

```json
{
  "headers": ["Name", "Age"],
  "rows": [
    { "Name": "Alice", "Age": 30 },
    { "Name": "Bob", "Age": 25 }
  ]
}
```

#### Using UPDATE

UPDATE allows you to update rows in a sheet based on a condition. You specify the sheet, the new values, and a condition to determine which rows to update. Then call .update() to execute.

```javascript
const gq = new GQuery();
gq.from("Sheet1")
  .where((row) => row.Age > 18)
  .update((row) => {
    row.Status = "Active";
  });
```

```
{
    "headers": ["Name", "Age", "Status"],
    "rows": [
        { "Name": "Alice", "Age": 30, "Status": "Active" },
        { "Name": "Bob", "Age": 25, "Status": "Active" }
    ]
}
```

#### Using APPEND

APPEND allows you to add new rows to a sheet. You specify the sheet and the new row data, then call .append() to execute.

```javascript
const gq = new GQuery();
gq.from("Sheet1").append({ Name: "Charlie", Age: 22 });
// Also accepts arrays: .append([{ Name: "Charlie", Age: 22 }, { Name: "David", Age: 28 }])
```

```
{
    "headers": ["Name", "Age"],
    "rows": [
        { "Name": "Charlie", "Age": 22 }
    ]
}
```

#### Using DELETE

DELETE allows you to remove rows from a sheet based on a condition. You specify the sheet and a condition to determine which rows to delete, then call .delete() to execute.

```javascript
const gq = new GQuery();
gq.from("Sheet1")
  .where((row) => row.Age < 18)
  .delete();
```

```
{
    "deletedRows": 2
}
```

#### Using JOINS

JOIN allows you to combine data from multiple sheets based on a common column. You specify the sheet to join with, the column to join on, and optionally which columns to return from the joined sheet.

Arguments:

- `sheetName`: The name of the sheet to join with.
- `sheetColumn`: The column in the joined sheet to join on.
- `joinColumn`: The column in the current sheet to join on. If not provided, it defaults to the same column name as `sheetColumn`.
- `selectColumns`: An array of column names to return from the joined sheet. If not provided, all columns from the joined sheet will be included.

```javascript
const gq = new GQuery();
const result = gq
  .from("Assets")
  .join("Users", "LoginId", "Assigned To", ["Name", "Department"])
  .get();
```

```json
{
  "headers": ["Id", "Model", "Assigned To", "Name", "Department"],
  "rows": [
    {
      "Id": "A001",
      "Model": "Laptop",
      "Assigned To": "user1",
      "Name": "Alice",
      "Department": "IT"
    },
    {
      "Id": "A002",
      "Model": "Monitor",
      "Assigned To": "user2",
      "Name": "Bob",
      "Department": "Design"
    }
  ]
}
```

## Benchmarking Performance

GQuery has been tested against native Apps Script methods for retrieving data from sheets. v1.4.0 marked the first time that GET performance matched SheetQuery, as native SpreadsheetApp logic is sufficient for reading data. However, SpreadsheetApp becomes exponentially slower when modifying data. As GQuery uses the Advanced Sheet Service, data updates are rapid and a bulk of processing time is application logic.

|        | v1.4.1 | v1.3.1 | v1.2.0 | SheetQuery |
| :----- | :----: | :----: | :----: | :--------: |
| GET    | 646ms  | 1311ms | 1660ms |   655ms    |
| UPDATE | 448ms  | 729ms  | 661ms  |  18070ms   |
| APPEND | 354ms  | 365ms  | 709ms  |  33559ms   |
| DELETE | 496ms  | 739ms  | 556ms  |  13959ms   |

The QUERY method is especially fast for large spreadsheets, as it leverages Google's internal query engine. However, it is limited to read-only operations and does not support joins.

| Total: 162,527 | ALL ROWS:\* | FILTERED ROWS: 656 |
| -------------- | :---------: | :----------------: |
| GET            |   7890ms    |       8199ms       |
| QUERY          |   7844ms    |       1821ms       |
