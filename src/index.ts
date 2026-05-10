#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerMysqlTools } from "./tools.js";

const server = new McpServer({
  name: "mysql-schema-mcp-server",
  version: "1.0.0",
});

registerMysqlTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server startup failed:", err);
  process.exit(1);
});
