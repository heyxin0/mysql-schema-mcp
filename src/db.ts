import {
  createConnection,
  type Connection,
  type QueryResult,
  type RowDataPacket,
} from "mysql2/promise";
import type { ExecuteValues } from "mysql2";

export type DatabaseConnectionConfig = {
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
};

export type DatabaseAccess = {
  queryRows<T extends RowDataPacket[]>(
    config: DatabaseConnectionConfig,
    sql: string,
    params?: ExecuteValues
  ): Promise<T>;
  executeStatement(
    config: DatabaseConnectionConfig,
    sql: string,
    params?: ExecuteValues
  ): Promise<void>;
};

async function withConnection<T>(
  config: DatabaseConnectionConfig,
  handler: (connection: Connection) => Promise<T>
): Promise<T> {
  const connection = await createConnection({
    host: config.host,
    port: config.port ?? 3306,
    user: config.user,
    password: config.password,
    database: config.database,
  });

  try {
    return await handler(connection);
  } finally {
    await connection.end().catch(() => undefined);
  }
}

async function queryRows<T extends RowDataPacket[]>(
  config: DatabaseConnectionConfig,
  sql: string,
  params: ExecuteValues = []
): Promise<T> {
  return withConnection(config, async (connection) => {
    const [rows] = await connection.execute<T>(sql, params);
    return rows;
  });
}

async function executeStatement(
  config: DatabaseConnectionConfig,
  sql: string,
  params: ExecuteValues = []
): Promise<void> {
  await withConnection(config, async (connection) => {
    await connection.execute<QueryResult>(sql, params);
  });
}

export const mysqlDatabaseAccess: DatabaseAccess = {
  queryRows,
  executeStatement,
};
