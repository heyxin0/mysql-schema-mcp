import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAlterTableSql,
  buildCreateTableSql,
  buildDropTableSql,
} from "../src/schema.js";

test("buildCreateTableSql builds table SQL with columns, primary key, indexes, and comment", () => {
  const sql = buildCreateTableSql({
    tableName: "users",
    tableComment: "User table",
    columns: [
      {
        name: "id",
        type: "bigint",
        nullable: false,
        autoIncrement: true,
        comment: "Primary key",
      },
      {
        name: "email",
        type: "varchar(255)",
        nullable: false,
        defaultValue: "",
        comment: "Email address",
      },
    ],
    primaryKey: ["id"],
    indexes: [
      {
        name: "idx_users_email",
        columns: ["email"],
        unique: true,
      },
    ],
  });

  assert.equal(
    sql,
    [
      "CREATE TABLE `users` (",
      "  `id` bigint NOT NULL AUTO_INCREMENT COMMENT 'Primary key',",
      "  `email` varchar(255) NOT NULL DEFAULT '' COMMENT 'Email address',",
      "  PRIMARY KEY (`id`),",
      "  UNIQUE KEY `idx_users_email` (`email`)",
      ")",
      "COMMENT='User table'",
    ].join("\n")
  );
});

test("buildCreateTableSql rejects references to unknown columns", () => {
  assert.throws(
    () =>
      buildCreateTableSql({
        tableName: "users",
        columns: [{ name: "id", type: "bigint" }],
        primaryKey: ["missing_column"],
      }),
    /Primary key references unknown column: missing_column/
  );
});

test("buildAlterTableSql builds clauses in the expected order", () => {
  const sql = buildAlterTableSql({
    tableName: "users",
    addColumns: [
      {
        name: "nickname",
        type: "varchar(64)",
        nullable: true,
        comment: "Display name",
      },
    ],
    modifyColumns: [
      {
        name: "email",
        type: "varchar(320)",
        nullable: false,
        comment: "Normalized email",
      },
    ],
    dropColumns: ["legacy_flag"],
    tableComment: "Updated user table",
  });

  assert.equal(
    sql,
    [
      "ALTER TABLE `users`",
      "  ADD COLUMN `nickname` varchar(64) NULL COMMENT 'Display name',",
      "  MODIFY COLUMN `email` varchar(320) NOT NULL COMMENT 'Normalized email',",
      "  DROP COLUMN `legacy_flag`,",
      "  COMMENT = 'Updated user table'",
    ].join("\n")
  );
});

test("buildAlterTableSql rejects empty changes", () => {
  assert.throws(
    () => buildAlterTableSql({ tableName: "users" }),
    /At least one alter operation is required/
  );
});

test("buildDropTableSql builds table drop SQL", () => {
  assert.equal(buildDropTableSql({ tableName: "users" }), "DROP TABLE `users`");
});

test("buildDropTableSql rejects empty table names", () => {
  assert.throws(
    () => buildDropTableSql({ tableName: "   " }),
    /Table name cannot be empty/
  );
});

test("buildDropTableSql escapes backticks in table names", () => {
  assert.equal(
    buildDropTableSql({ tableName: "user`archive" }),
    "DROP TABLE `user``archive`"
  );
});
