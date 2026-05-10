export type ColumnDefinition = {
  name: string;
  type: string;
  nullable?: boolean;
  defaultValue?: string | number | null;
  autoIncrement?: boolean;
  comment?: string;
};

export type IndexDefinition = {
  name: string;
  columns: string[];
  unique?: boolean;
};

export type CreateTableDefinition = {
  tableName: string;
  tableComment?: string;
  columns: ColumnDefinition[];
  primaryKey?: string[];
  indexes?: IndexDefinition[];
};

export type AlterTableDefinition = {
  tableName: string;
  addColumns?: ColumnDefinition[];
  modifyColumns?: ColumnDefinition[];
  dropColumns?: string[];
  tableComment?: string;
};

export type DropTableDefinition = {
  tableName: string;
};

function escapeIdentifier(value: string): string {
  return `\`${value.replace(/`/g, "``")}\``;
}

function escapeStringLiteral(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function formatDefaultValue(value: string | number | null): string {
  if (value === null) {
    return "NULL";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Default value must be a finite number");
    }

    return String(value);
  }

  return escapeStringLiteral(value);
}

function buildColumnSql(column: ColumnDefinition): string {
  const parts = [escapeIdentifier(column.name), column.type.trim()];

  parts.push(column.nullable === false ? "NOT NULL" : "NULL");

  if (column.defaultValue !== undefined) {
    parts.push(`DEFAULT ${formatDefaultValue(column.defaultValue)}`);
  }

  if (column.autoIncrement) {
    parts.push("AUTO_INCREMENT");
  }

  if (column.comment !== undefined) {
    parts.push(`COMMENT ${escapeStringLiteral(column.comment)}`);
  }

  return parts.join(" ");
}

function ensureNonEmptyUniqueNames(
  values: string[],
  label: string,
  allowEmpty = false
): void {
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = value.trim();

    if (!allowEmpty && normalized.length === 0) {
      throw new Error(`${label} cannot be empty`);
    }

    if (seen.has(normalized)) {
      throw new Error(`Duplicate ${label.toLowerCase()}: ${normalized}`);
    }

    seen.add(normalized);
  }
}

function validateColumns(columns: ColumnDefinition[]): void {
  if (columns.length === 0) {
    throw new Error("At least one column is required");
  }

  ensureNonEmptyUniqueNames(
    columns.map((column) => column.name),
    "Column name"
  );

  for (const column of columns) {
    if (column.type.trim().length === 0) {
      throw new Error(`Column type cannot be empty for ${column.name}`);
    }
  }
}

function ensureReferencedColumnsExist(
  referencedColumns: string[],
  definedColumns: Set<string>,
  label: string
): void {
  for (const columnName of referencedColumns) {
    if (!definedColumns.has(columnName)) {
      throw new Error(`${label} references unknown column: ${columnName}`);
    }
  }
}

function validateIndexes(
  indexes: IndexDefinition[],
  definedColumns: Set<string>
): void {
  ensureNonEmptyUniqueNames(
    indexes.map((index) => index.name),
    "Index name"
  );

  for (const index of indexes) {
    if (index.columns.length === 0) {
      throw new Error(`Index ${index.name} must contain at least one column`);
    }

    ensureNonEmptyUniqueNames(index.columns, `Index column for ${index.name}`);
    ensureReferencedColumnsExist(
      index.columns,
      definedColumns,
      `Index ${index.name}`
    );
  }
}

export function buildCreateTableSql(definition: CreateTableDefinition): string {
  const tableName = definition.tableName.trim();

  if (tableName.length === 0) {
    throw new Error("Table name cannot be empty");
  }

  validateColumns(definition.columns);

  const columnNames = new Set(definition.columns.map((column) => column.name));

  if (definition.primaryKey && definition.primaryKey.length > 0) {
    ensureNonEmptyUniqueNames(definition.primaryKey, "Primary key column");
    ensureReferencedColumnsExist(
      definition.primaryKey,
      columnNames,
      "Primary key"
    );
  }

  if (definition.indexes) {
    validateIndexes(definition.indexes, columnNames);
  }

  const lines = definition.columns.map((column) => buildColumnSql(column));

  if (definition.primaryKey && definition.primaryKey.length > 0) {
    lines.push(
      `PRIMARY KEY (${definition.primaryKey
        .map((column) => escapeIdentifier(column))
        .join(", ")})`
    );
  }

  for (const index of definition.indexes ?? []) {
    const indexType = index.unique ? "UNIQUE KEY" : "KEY";
    lines.push(
      `${indexType} ${escapeIdentifier(index.name)} (${index.columns
        .map((column) => escapeIdentifier(column))
        .join(", ")})`
    );
  }

  const sql = [
    `CREATE TABLE ${escapeIdentifier(tableName)} (`,
    lines.map((line) => `  ${line}`).join(",\n"),
    `)`,
  ];

  if (definition.tableComment !== undefined) {
    sql.push(`COMMENT=${escapeStringLiteral(definition.tableComment)}`);
  }

  return sql.join("\n");
}

export function buildAlterTableSql(definition: AlterTableDefinition): string {
  const tableName = definition.tableName.trim();

  if (tableName.length === 0) {
    throw new Error("Table name cannot be empty");
  }

  const clauses: string[] = [];

  if (definition.addColumns && definition.addColumns.length > 0) {
    validateColumns(definition.addColumns);
    clauses.push(
      ...definition.addColumns.map(
        (column) => `ADD COLUMN ${buildColumnSql(column)}`
      )
    );
  }

  if (definition.modifyColumns && definition.modifyColumns.length > 0) {
    validateColumns(definition.modifyColumns);
    clauses.push(
      ...definition.modifyColumns.map(
        (column) => `MODIFY COLUMN ${buildColumnSql(column)}`
      )
    );
  }

  if (definition.dropColumns && definition.dropColumns.length > 0) {
    ensureNonEmptyUniqueNames(definition.dropColumns, "Drop column");
    clauses.push(
      ...definition.dropColumns.map(
        (columnName) => `DROP COLUMN ${escapeIdentifier(columnName)}`
      )
    );
  }

  if (definition.tableComment !== undefined) {
    clauses.push(`COMMENT = ${escapeStringLiteral(definition.tableComment)}`);
  }

  if (clauses.length === 0) {
    throw new Error("At least one alter operation is required");
  }

  return `ALTER TABLE ${escapeIdentifier(tableName)}\n${clauses
    .map((clause) => `  ${clause}`)
    .join(",\n")}`;
}

export function buildDropTableSql(definition: DropTableDefinition): string {
  const tableName = definition.tableName.trim();

  if (tableName.length === 0) {
    throw new Error("Table name cannot be empty");
  }

  return `DROP TABLE ${escapeIdentifier(tableName)}`;
}
