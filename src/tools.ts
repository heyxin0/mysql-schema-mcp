import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type RowDataPacket } from "mysql2/promise";
import * as z from "zod/v4";
import {
  type DatabaseAccess,
  type DatabaseConnectionConfig,
  mysqlDatabaseAccess,
} from "./db.js";
import {
  buildAlterTableSql,
  buildCreateTableSql,
  buildDropTableSql,
  type AlterTableDefinition,
} from "./schema.js";

type ColumnRow = RowDataPacket & {
  COLUMN_NAME: string;
  COLUMN_COMMENT: string;
};

type TableRow = RowDataPacket & {
  TABLE_NAME: string;
  TABLE_COMMENT: string;
};

type TableColumnsResult = {
  database: string;
  table: {
    tableName: string;
    tableComment: string;
  };
  columns: Array<{
    columnName: string;
    columnComment: string;
  }>;
};

type TableMutationResult = {
  database: string;
  tableName: string;
  action: "create_table" | "alter_table" | "drop_table";
  success: boolean;
  summary: string;
  appliedChanges?: {
    addColumns: number;
    modifyColumns: number;
    dropColumns: number;
    updateTableComment: boolean;
  };
};

const databaseConnectionSchema = z.object({
  host: z.string().min(1).describe("MySQL host"),
  port: z.number().int().positive().default(3306).describe("MySQL port"),
  user: z.string().min(1).describe("MySQL username"),
  password: z.string().describe("MySQL password"),
  database: z.string().min(1).describe("Database name / schema name"),
});

const defaultValueSchema = z.union([z.string(), z.number(), z.null()]);

const columnDefinitionSchema = z.object({
  name: z.string().min(1).describe("Column name"),
  type: z.string().min(1).describe("MySQL column type, e.g. varchar(255)"),
  nullable: z.boolean().optional().describe("Whether the column is nullable"),
  defaultValue: defaultValueSchema.optional().describe("Column default value"),
  autoIncrement: z.boolean().optional().describe("Whether AUTO_INCREMENT is enabled"),
  comment: z.string().optional().describe("Column comment"),
});

const indexDefinitionSchema = z.object({
  name: z.string().min(1).describe("Index name"),
  columns: z.array(z.string().min(1)).min(1).describe("Indexed columns"),
  unique: z.boolean().optional().describe("Whether the index is unique"),
});

const tableColumnsOutputSchema = z.object({
  database: z.string(),
  table: z.object({
    tableName: z.string(),
    tableComment: z.string(),
  }),
  columns: z.array(
    z.object({
      columnName: z.string(),
      columnComment: z.string(),
    })
  ),
});

const tableMutationOutputSchema = z.object({
  database: z.string(),
  tableName: z.string(),
  action: z.enum(["create_table", "alter_table", "drop_table"]),
  success: z.boolean(),
  summary: z.string(),
  appliedChanges: z
    .object({
      addColumns: z.number().int().nonnegative(),
      modifyColumns: z.number().int().nonnegative(),
      dropColumns: z.number().int().nonnegative(),
      updateTableComment: z.boolean(),
    })
    .optional(),
});

function serializeResult(result: object): string {
  return JSON.stringify(result, null, 2);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown database error";
}

function createErrorResponse<T extends object>(
  message: string,
  structuredContent: T
) {
  return {
    content: [{ type: "text" as const, text: message }],
    structuredContent,
    isError: true,
  };
}

function buildCreateSummary(tableName: string, columnCount: number): string {
  return `Created table ${tableName} with ${columnCount} column${
    columnCount === 1 ? "" : "s"
  }.`;
}

function buildAlterSummary(
  tableName: string,
  addColumns: number,
  modifyColumns: number,
  dropColumns: number,
  updateTableComment: boolean
): string {
  const actions: string[] = [];

  if (addColumns > 0) {
    actions.push(`added ${addColumns} column${addColumns === 1 ? "" : "s"}`);
  }

  if (modifyColumns > 0) {
    actions.push(
      `modified ${modifyColumns} column${modifyColumns === 1 ? "" : "s"}`
    );
  }

  if (dropColumns > 0) {
    actions.push(`dropped ${dropColumns} column${dropColumns === 1 ? "" : "s"}`);
  }

  if (updateTableComment) {
    actions.push("updated the table comment");
  }

  return `Altered table ${tableName}: ${actions.join(", ")}.`;
}

function buildDropSummary(tableName: string): string {
  return `Dropped table ${tableName}.`;
}

export function createToolHandlers(databaseAccess: DatabaseAccess = mysqlDatabaseAccess) {
  const getTableColumns = async ({
    host,
    port = 3306,
    user,
    password,
    database,
    tableName,
  }: DatabaseConnectionConfig & { tableName: string }) => {
    const config = { host, port, user, password, database };

    try {
      const tableSql = `
        SELECT
          TABLE_NAME,
          TABLE_COMMENT
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = ?
        LIMIT 1
      `;

      const tableRows = await databaseAccess.queryRows<TableRow[]>(config, tableSql, [
        database,
        tableName,
      ]);

      if (tableRows.length === 0) {
        const result: TableColumnsResult = {
          database,
          table: {
            tableName,
            tableComment: "",
          },
          columns: [],
        };

        return {
          content: [{ type: "text" as const, text: serializeResult(result) }],
          structuredContent: result,
        };
      }

      const columnSql = `
        SELECT
          COLUMN_NAME,
          COLUMN_COMMENT
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION ASC
      `;

      const rows = await databaseAccess.queryRows<ColumnRow[]>(config, columnSql, [
        database,
        tableName,
      ]);

      const result: TableColumnsResult = {
        database,
        table: {
          tableName: tableRows[0].TABLE_NAME,
          tableComment: tableRows[0].TABLE_COMMENT,
        },
        columns: rows.map((row) => ({
          columnName: row.COLUMN_NAME,
          columnComment: row.COLUMN_COMMENT,
        })),
      };

      return {
        content: [{ type: "text" as const, text: serializeResult(result) }],
        structuredContent: result,
      };
    } catch (error) {
      const result: TableColumnsResult = {
        database,
        table: {
          tableName,
          tableComment: "",
        },
        columns: [],
      };

      return createErrorResponse(
        `Failed to query schema metadata: ${getErrorMessage(error)}`,
        result
      );
    }
  };

  const createTable = async ({
    host,
    port = 3306,
    user,
    password,
    database,
    tableName,
    tableComment,
    columns,
    primaryKey,
    indexes,
  }: DatabaseConnectionConfig & {
    tableName: string;
    tableComment?: string;
    columns: Array<z.infer<typeof columnDefinitionSchema>>;
    primaryKey?: string[];
    indexes?: Array<z.infer<typeof indexDefinitionSchema>>;
  }) => {
    const config = { host, port, user, password, database };

    try {
      const sql = buildCreateTableSql({
        tableName,
        tableComment,
        columns,
        primaryKey,
        indexes,
      });

      await databaseAccess.executeStatement(config, sql);

      const result: TableMutationResult = {
        database,
        tableName,
        action: "create_table",
        success: true,
        summary: buildCreateSummary(tableName, columns.length),
      };

      return {
        content: [{ type: "text" as const, text: serializeResult(result) }],
        structuredContent: result,
      };
    } catch (error) {
      const result: TableMutationResult = {
        database,
        tableName,
        action: "create_table",
        success: false,
        summary: `Failed to create table ${tableName}.`,
      };

      return createErrorResponse(
        `Failed to create table: ${getErrorMessage(error)}`,
        result
      );
    }
  };

  const alterTable = async ({
    host,
    port = 3306,
    user,
    password,
    database,
    tableName,
    addColumns,
    modifyColumns,
    dropColumns,
    tableComment,
  }: DatabaseConnectionConfig & AlterTableDefinition) => {
    const config = { host, port, user, password, database };
    const addColumnsCount = addColumns?.length ?? 0;
    const modifyColumnsCount = modifyColumns?.length ?? 0;
    const dropColumnsCount = dropColumns?.length ?? 0;
    const updateTableComment = tableComment !== undefined;

    try {
      const sql = buildAlterTableSql({
        tableName,
        addColumns,
        modifyColumns,
        dropColumns,
        tableComment,
      });

      await databaseAccess.executeStatement(config, sql);

      const result: TableMutationResult = {
        database,
        tableName,
        action: "alter_table",
        success: true,
        summary: buildAlterSummary(
          tableName,
          addColumnsCount,
          modifyColumnsCount,
          dropColumnsCount,
          updateTableComment
        ),
        appliedChanges: {
          addColumns: addColumnsCount,
          modifyColumns: modifyColumnsCount,
          dropColumns: dropColumnsCount,
          updateTableComment,
        },
      };

      return {
        content: [{ type: "text" as const, text: serializeResult(result) }],
        structuredContent: result,
      };
    } catch (error) {
      const result: TableMutationResult = {
        database,
        tableName,
        action: "alter_table",
        success: false,
        summary: `Failed to alter table ${tableName}.`,
        appliedChanges: {
          addColumns: addColumnsCount,
          modifyColumns: modifyColumnsCount,
          dropColumns: dropColumnsCount,
          updateTableComment,
        },
      };

      return createErrorResponse(
        `Failed to alter table: ${getErrorMessage(error)}`,
        result
      );
    }
  };

  const dropTable = async ({
    host,
    port = 3306,
    user,
    password,
    database,
    tableName,
    confirm,
  }: DatabaseConnectionConfig & { tableName: string; confirm?: boolean }) => {
    const config = { host, port, user, password, database };

    if (confirm !== true) {
      const result: TableMutationResult = {
        database,
        tableName,
        action: "drop_table",
        success: false,
        summary: `Failed to drop table ${tableName}.`,
      };

      return createErrorResponse(
        "Failed to drop table: confirm must be true.",
        result
      );
    }

    try {
      const sql = buildDropTableSql({ tableName });

      await databaseAccess.executeStatement(config, sql);

      const result: TableMutationResult = {
        database,
        tableName,
        action: "drop_table",
        success: true,
        summary: buildDropSummary(tableName),
      };

      return {
        content: [{ type: "text" as const, text: serializeResult(result) }],
        structuredContent: result,
      };
    } catch (error) {
      const result: TableMutationResult = {
        database,
        tableName,
        action: "drop_table",
        success: false,
        summary: `Failed to drop table ${tableName}.`,
      };

      return createErrorResponse(
        `Failed to drop table: ${getErrorMessage(error)}`,
        result
      );
    }
  };

  return {
    getTableColumns,
    createTable,
    alterTable,
    dropTable,
  };
}

export function registerMysqlTools(
  server: McpServer,
  databaseAccess: DatabaseAccess = mysqlDatabaseAccess
): void {
  const handlers = createToolHandlers(databaseAccess);

  server.registerTool(
    "get_table_columns",
    {
      title: "Get MySQL Table Columns",
      description:
        "Connect to MySQL using the provided connection info and return the table name, table comment, and column comments for the specified table.",
      inputSchema: databaseConnectionSchema.extend({
        tableName: z.string().min(1).describe("Target table name"),
      }),
      outputSchema: tableColumnsOutputSchema,
    },
    handlers.getTableColumns
  );

  server.registerTool(
    "create_table",
    {
      title: "Create MySQL Table",
      description:
        "Create a MySQL table from structured table metadata including columns, primary key, indexes, and table comment.",
      inputSchema: databaseConnectionSchema.extend({
        tableName: z.string().min(1).describe("Table name"),
        tableComment: z.string().optional().describe("Table comment"),
        columns: z.array(columnDefinitionSchema).min(1).describe("Table columns"),
        primaryKey: z
          .array(z.string().min(1))
          .optional()
          .describe("Primary key column names"),
        indexes: z
          .array(indexDefinitionSchema)
          .optional()
          .describe("Secondary indexes"),
      }),
      outputSchema: tableMutationOutputSchema,
    },
    handlers.createTable
  );

  server.registerTool(
    "alter_table",
    {
      title: "Alter MySQL Table",
      description:
        "Alter a MySQL table using common structured operations such as adding columns, modifying columns, dropping columns, and updating the table comment.",
      inputSchema: databaseConnectionSchema.extend({
        tableName: z.string().min(1).describe("Target table name"),
        addColumns: z
          .array(columnDefinitionSchema)
          .optional()
          .describe("Columns to add"),
        modifyColumns: z
          .array(columnDefinitionSchema)
          .optional()
          .describe("Columns to modify"),
        dropColumns: z
          .array(z.string().min(1))
          .optional()
          .describe("Column names to drop"),
        tableComment: z.string().optional().describe("New table comment"),
      }),
      outputSchema: tableMutationOutputSchema,
    },
    handlers.alterTable
  );

  server.registerTool(
    "drop_table",
    {
      title: "Drop MySQL Table",
      description:
        "Drop a MySQL table. The caller must pass confirm: true to execute this destructive operation.",
      inputSchema: databaseConnectionSchema.extend({
        tableName: z.string().min(1).describe("Target table name"),
        confirm: z
          .literal(true)
          .describe("Must be true to confirm the destructive drop operation"),
      }),
      outputSchema: tableMutationOutputSchema,
    },
    handlers.dropTable
  );
}
