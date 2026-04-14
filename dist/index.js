import { McpServer, StdioServerTransport } from "@modelcontextprotocol/server";
import { createConnection, } from "mysql2/promise";
import * as z from "zod/v4";
const server = new McpServer({
    name: "mysql-schema-mcp-server",
    version: "1.0.0",
});
server.registerTool("get_table_columns", {
    title: "Get MySQL Table Columns",
    description: "Connect to MySQL using the provided connection info and return the table name, table comment, and column comments for the specified table.",
    inputSchema: z.object({
        host: z.string().min(1).describe("MySQL host"),
        port: z.number().int().positive().default(3306).describe("MySQL port"),
        user: z.string().min(1).describe("MySQL username"),
        password: z.string().describe("MySQL password"),
        database: z.string().min(1).describe("Database name / schema name"),
        tableName: z.string().min(1).describe("Target table name"),
    }),
    outputSchema: z.object({
        database: z.string(),
        table: z.object({
            tableName: z.string(),
            tableComment: z.string(),
        }),
        columns: z.array(z.object({
            columnName: z.string(),
            columnComment: z.string(),
        })),
    }),
}, async ({ host, port = 3306, user, password, database, tableName }) => {
    let connection;
    try {
        connection = await createConnection({
            host,
            port,
            user,
            password,
            database,
        });
        const tableSql = `
        SELECT
          TABLE_NAME,
          TABLE_COMMENT
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = ?
        LIMIT 1
      `;
        const [tableRows] = await connection.execute(tableSql, [
            database,
            tableName,
        ]);
        if (!tableRows || tableRows.length === 0) {
            const result = {
                database,
                table: {
                    tableName,
                    tableComment: "",
                },
                columns: [],
            };
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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
        const [rows] = await connection.execute(columnSql, [
            database,
            tableName,
        ]);
        const columns = rows.map((row) => ({
            columnName: row.COLUMN_NAME,
            columnComment: row.COLUMN_COMMENT,
        }));
        const result = {
            database,
            table: {
                tableName: tableRows[0].TABLE_NAME,
                tableComment: tableRows[0].TABLE_COMMENT,
            },
            columns,
        };
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown database error";
        const result = {
            database,
            table: {
                tableName,
                tableComment: "",
            },
            columns: [],
        };
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to query schema metadata: ${message}`,
                },
            ],
            structuredContent: result,
            isError: true,
        };
    }
    finally {
        if (connection) {
            await connection.end().catch(() => undefined);
        }
    }
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((err) => {
    console.error("MCP server startup failed:", err);
    process.exit(1);
});
