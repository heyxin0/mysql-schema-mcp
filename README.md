# MySQL Schema MCP 简介 | Introduction to MySQL Schema MCP

## 中文

**MySQL Schema MCP** 是一个面向 MySQL 数据库的 Schema 能力接入模块，基于 **MCP（Model Context Protocol）** 标准构建。它能够将数据库中的表结构、字段定义、索引信息、主外键关系等元数据，以统一、规范且安全的方式提供给大模型或智能代理使用。

借助 MySQL Schema MCP，AI 不再需要依赖模糊推断来理解数据库，而是能够基于真实的 Schema 上下文执行 SQL 生成、结构分析、开发辅助和数据问答等任务，从而显著提升结果的准确性与可用性。

当前工具还提供最小表级 DDL 能力：创建表、修改表，以及需要显式确认的删除表操作。

### 核心价值

- 让 AI 基于真实数据库结构进行理解和推理
- 降低 SQL 生成中的字段错误、表关联错误和语义偏差
- 通过标准化协议提升系统接入与扩展效率
- 在不直接暴露业务数据的前提下提供结构化上下文
- 支持智能开发、数据分析和数据库文档生成等场景

### 典型场景

- 智能 SQL 生成
- 数据库结构问答
- 多表关系分析
- 后端开发辅助
- 报表与数据查询支持
- 数据库文档自动生成

### 一句话总结

**MySQL Schema MCP 是连接 MySQL 数据库结构与 AI 能力之间的标准化桥梁。**

---

## English

**MySQL Schema MCP** is a schema access module designed for MySQL databases, built on the **MCP (Model Context Protocol)** standard. It exposes metadata such as table structures, column definitions, index information, and primary/foreign key relationships in a unified, standardized, and secure way for large language models and intelligent agents.

With MySQL Schema MCP, AI no longer has to rely on guesswork to understand a database. Instead, it can work from the actual schema context to perform tasks such as SQL generation, schema analysis, development assistance, and database Q&A, significantly improving accuracy and usability.

The current tools also provide minimal table-level DDL support: creating tables, altering tables, and dropping tables with explicit confirmation.

### Core Value

- Enable AI to reason based on the real database structure
- Reduce SQL errors related to fields, joins, and semantics
- Improve integration and extensibility through a standardized protocol
- Provide structured context without directly exposing business data
- Support intelligent development, data analysis, and database documentation generation

### Typical Use Cases

- Intelligent SQL generation
- Database schema Q&A
- Multi-table relationship analysis
- Backend development assistance
- Reporting and query support
- Automated database documentation

### One-Sentence Summary

**MySQL Schema MCP is a standardized bridge between MySQL database structures and AI capabilities.**
