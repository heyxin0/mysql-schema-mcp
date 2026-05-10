import test from "node:test";
import assert from "node:assert/strict";
import { createToolHandlers } from "../src/tools.js";
import type { DatabaseAccess, DatabaseConnectionConfig } from "../src/db.js";

function createConfig(): DatabaseConnectionConfig {
  return {
    host: "127.0.0.1",
    port: 3306,
    user: "root",
    password: "secret",
    database: "app_db",
  };
}

test("getTableColumns returns metadata from the shared database access layer", async () => {
  const calls: string[] = [];
  const handlers = createToolHandlers({
    async queryRows(_config, sql) {
      calls.push(sql);

      if (sql.includes("INFORMATION_SCHEMA.TABLES")) {
        return [
          {
            TABLE_NAME: "users",
            TABLE_COMMENT: "User table",
          },
        ] as never;
      }

      return [
        {
          COLUMN_NAME: "id",
          COLUMN_COMMENT: "Primary key",
        },
      ] as never;
    },
    async executeStatement() {
      throw new Error("Not implemented");
    },
  });

  const result = await handlers.getTableColumns({
    ...createConfig(),
    tableName: "users",
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(result.structuredContent, {
    database: "app_db",
    table: {
      tableName: "users",
      tableComment: "User table",
    },
    columns: [
      {
        columnName: "id",
        columnComment: "Primary key",
      },
    ],
  });
  assert.equal(result.isError, undefined);
});

test("createTable executes generated SQL and returns a stable success summary", async () => {
  let executedSql = "";
  const handlers = createToolHandlers({
    async queryRows() {
      return [] as never;
    },
    async executeStatement(_config, sql) {
      executedSql = sql;
    },
  });

  const result = await handlers.createTable({
    ...createConfig(),
    tableName: "users",
    tableComment: "User table",
    columns: [
      {
        name: "id",
        type: "bigint",
        nullable: false,
      },
    ],
    primaryKey: ["id"],
  });

  assert.match(executedSql, /^CREATE TABLE `users`/);
  assert.deepEqual(result.structuredContent, {
    database: "app_db",
    tableName: "users",
    action: "create_table",
    success: true,
    summary: "Created table users with 1 column.",
  });
});

test("createTable returns an MCP error when validation fails", async () => {
  const handlers = createToolHandlers({
    async queryRows() {
      return [] as never;
    },
    async executeStatement() {
      throw new Error("Should not execute");
    },
  });

  const result = await handlers.createTable({
    ...createConfig(),
    tableName: "users",
    columns: [{ name: "id", type: "bigint" }],
    primaryKey: ["missing_column"],
  });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Failed to create table/);
  assert.deepEqual(result.structuredContent, {
    database: "app_db",
    tableName: "users",
    action: "create_table",
    success: false,
    summary: "Failed to create table users.",
  });
});

test("alterTable executes SQL with ordered changes and returns applied change counts", async () => {
  let executedSql = "";
  const handlers = createToolHandlers({
    async queryRows() {
      return [] as never;
    },
    async executeStatement(_config, sql) {
      executedSql = sql;
    },
  });

  const result = await handlers.alterTable({
    ...createConfig(),
    tableName: "users",
    addColumns: [{ name: "nickname", type: "varchar(32)" }],
    modifyColumns: [{ name: "email", type: "varchar(320)", nullable: false }],
    dropColumns: ["legacy_flag"],
    tableComment: "Updated user table",
  });

  assert.match(
    executedSql,
    /ADD COLUMN[\s\S]*MODIFY COLUMN[\s\S]*DROP COLUMN[\s\S]*COMMENT =/
  );
  assert.deepEqual(result.structuredContent, {
    database: "app_db",
    tableName: "users",
    action: "alter_table",
    success: true,
    summary:
      "Altered table users: added 1 column, modified 1 column, dropped 1 column, updated the table comment.",
    appliedChanges: {
      addColumns: 1,
      modifyColumns: 1,
      dropColumns: 1,
      updateTableComment: true,
    },
  });
});

test("alterTable returns an MCP error when no changes are provided", async () => {
  const handlers = createToolHandlers({
    async queryRows() {
      return [] as never;
    },
    async executeStatement() {
      throw new Error("Should not execute");
    },
  });

  const result = await handlers.alterTable({
    ...createConfig(),
    tableName: "users",
  });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /At least one alter operation is required/);
  assert.deepEqual(result.structuredContent, {
    database: "app_db",
    tableName: "users",
    action: "alter_table",
    success: false,
    summary: "Failed to alter table users.",
    appliedChanges: {
      addColumns: 0,
      modifyColumns: 0,
      dropColumns: 0,
      updateTableComment: false,
    },
  });
});

test("dropTable executes SQL only when explicitly confirmed", async () => {
  let executedSql = "";
  const handlers = createToolHandlers({
    async queryRows() {
      return [] as never;
    },
    async executeStatement(_config, sql) {
      executedSql = sql;
    },
  });

  const result = await handlers.dropTable({
    ...createConfig(),
    tableName: "users",
    confirm: true,
  });

  assert.equal(executedSql, "DROP TABLE `users`");
  assert.deepEqual(result.structuredContent, {
    database: "app_db",
    tableName: "users",
    action: "drop_table",
    success: true,
    summary: "Dropped table users.",
  });
});

test("dropTable returns an MCP error without explicit confirmation", async () => {
  let executeCallCount = 0;
  const handlers = createToolHandlers({
    async queryRows() {
      return [] as never;
    },
    async executeStatement() {
      executeCallCount += 1;
    },
  });

  const result = await handlers.dropTable({
    ...createConfig(),
    tableName: "users",
  });

  assert.equal(executeCallCount, 0);
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /confirm must be true/);
  assert.deepEqual(result.structuredContent, {
    database: "app_db",
    tableName: "users",
    action: "drop_table",
    success: false,
    summary: "Failed to drop table users.",
  });
});

test("database failures are surfaced as MCP errors across tools", async () => {
  const databaseError = new Error("Connection lost");
  const failingAccess: DatabaseAccess = {
    async queryRows() {
      throw databaseError;
    },
    async executeStatement() {
      throw databaseError;
    },
  };
  const handlers = createToolHandlers(failingAccess);

  const getColumns = await handlers.getTableColumns({
    ...createConfig(),
    tableName: "users",
  });
  const createTable = await handlers.createTable({
    ...createConfig(),
    tableName: "users",
    columns: [{ name: "id", type: "bigint" }],
  });
  const alterTable = await handlers.alterTable({
    ...createConfig(),
    tableName: "users",
    addColumns: [{ name: "nickname", type: "varchar(32)" }],
  });
  const dropTable = await handlers.dropTable({
    ...createConfig(),
    tableName: "users",
    confirm: true,
  });

  assert.equal(getColumns.isError, true);
  assert.match(getColumns.content[0].text, /Connection lost/);
  assert.equal(createTable.isError, true);
  assert.match(createTable.content[0].text, /Connection lost/);
  assert.equal(alterTable.isError, true);
  assert.match(alterTable.content[0].text, /Connection lost/);
  assert.equal(dropTable.isError, true);
  assert.match(dropTable.content[0].text, /Connection lost/);
});
