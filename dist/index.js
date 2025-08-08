"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GQueryTableFactory = exports.GQueryTable = exports.GQuery = void 0;
var get_1 = require("./get");
var update_1 = require("./update");
var append_1 = require("./append");
var delete_1 = require("./delete");
__exportStar(require("./types"), exports);
var GQuery = /** @class */ (function () {
    function GQuery(spreadsheetId) {
        this.spreadsheetId = spreadsheetId
            ? spreadsheetId
            : SpreadsheetApp.getActiveSpreadsheet().getId();
    }
    GQuery.prototype.from = function (sheetName) {
        return new GQueryTable(this, this.spreadsheetId, sheetName);
    };
    GQuery.prototype.getMany = function (sheetNames, options) {
        return (0, get_1.getManyInternal)(this, sheetNames, options);
    };
    return GQuery;
}());
exports.GQuery = GQuery;
var GQueryTable = /** @class */ (function () {
    function GQueryTable(gquery, spreadsheetId, sheetName) {
        this.spreadsheetId = spreadsheetId;
        this.sheetName = sheetName;
        this.spreadsheet = SpreadsheetApp.openById(spreadsheetId);
        this.sheet = this.spreadsheet.getSheetByName(sheetName);
        this.gquery = gquery;
    }
    GQueryTable.prototype.select = function (headers) {
        return new GQueryTableFactory(this).select(headers);
    };
    GQueryTable.prototype.where = function (filterFn) {
        return new GQueryTableFactory(this).where(filterFn);
    };
    GQueryTable.prototype.join = function (sheetName, sheetColumn, joinColumn, columnsToReturn) {
        return new GQueryTableFactory(this).join(sheetName, sheetColumn, joinColumn, columnsToReturn);
    };
    GQueryTable.prototype.update = function (updateFn) {
        return new GQueryTableFactory(this).update(updateFn);
    };
    GQueryTable.prototype.append = function (data) {
        // Handle single object by wrapping it in an array
        var dataArray = Array.isArray(data) ? data : [data];
        return (0, append_1.appendInternal)(this, dataArray);
    };
    GQueryTable.prototype.get = function (options) {
        return new GQueryTableFactory(this).get(options);
    };
    GQueryTable.prototype.query = function (query) {
        return (0, get_1.queryInternal)(this, query);
    };
    GQueryTable.prototype.delete = function () {
        return new GQueryTableFactory(this).delete();
    };
    return GQueryTable;
}());
exports.GQueryTable = GQueryTable;
var GQueryTableFactory = /** @class */ (function () {
    function GQueryTableFactory(GQueryTable) {
        this.joinOption = [];
        this.gQueryTable = GQueryTable;
    }
    GQueryTableFactory.prototype.select = function (headers) {
        this.selectOption = headers;
        return this;
    };
    GQueryTableFactory.prototype.where = function (filterFn) {
        this.filterOption = filterFn;
        return this;
    };
    GQueryTableFactory.prototype.join = function (sheetName, sheetColumn, joinColumn, columnsToReturn) {
        this.joinOption.push({
            sheetName: sheetName,
            sheetColumn: sheetColumn,
            joinColumn: joinColumn,
            columnsToReturn: columnsToReturn,
        });
        return this;
    };
    GQueryTableFactory.prototype.get = function (options) {
        return (0, get_1.getInternal)(this, options);
    };
    GQueryTableFactory.prototype.update = function (updateFn) {
        return (0, update_1.updateInternal)(this, updateFn);
    };
    GQueryTableFactory.prototype.append = function (data) {
        // Handle single object by wrapping it in an array
        var dataArray = Array.isArray(data) ? data : [data];
        return (0, append_1.appendInternal)(this.gQueryTable, dataArray);
    };
    GQueryTableFactory.prototype.delete = function () {
        return (0, delete_1.deleteInternal)(this);
    };
    return GQueryTableFactory;
}());
exports.GQueryTableFactory = GQueryTableFactory;
