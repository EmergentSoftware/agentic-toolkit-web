---
name: sql
description: SQL Server T-SQL best practices for database design, naming, data types, code patterns, and formatting. Use when creating, reviewing, or modifying any SQL Server database objects (.sql files) including tables, stored procedures, functions, views, indexes, or writing T-SQL queries. Also use when reviewing database schemas or making data model decisions.
---

# SQL Server Best Practices

Comprehensive SQL Server conventions based on sp_Develop (Kevin Martin) with project-specific formatting rules.

## Critical Formatting Rules

**Formatting rules from `references/formatting-rules.md` take absolute precedence.** Key points:

- **UPPERCASE** all SQL keywords; **lowercase** all data types
- **3-space** indentation, JOINs aligned with FROM
- **Trailing commas** (end of line), not leading
- **No square brackets** on valid object names: `dbo.TableName` not `[dbo].[TableName]`
- **JOIN types**: `JOIN`, `LEFT JOIN` (optional `INNER` or `OUTER` are to be omitted)
- **Semicolons** required at statement end
- **Alignment padding** on select aliases, table aliases and assignments
- **Parentheses on own lines** for subqueries, EXISTS, proc params, CREATE TABLE columns
- **DEFAULT constraints are inline** with the column definition — never as separate table-level constraints

See `references/formatting-rules.md` for complete rules and `references/formatting-examples.sql` for examples.

## Quick Reference - Top Rules

### Naming
- **PascalCase** everything, **singular** table names, **no prefixes** (`tbl_`, `FK_`, `PK_`, `IX_`)
- Primary keys: `[TableName]Id` (never just `Id`)
- FK columns match parent PK name; FK constraint: `[FK-SCHEMA]_[FK-TABLE]_[FK-COL]_[PK-SCHEMA]_[PK-TABLE]`
- Stored procedures: `EntityAction` pattern (`ProductGet`, `OrderUpdate`)
- Boolean columns: affirmative (`IsActive`, `HasPermission`, not `IsNotDeleted`)

### Tables
- Normalize to BCNF (3.5NF); use TPT inheritance
- Every table needs: clustered index, primary key (surrogate), audit columns
- Audit columns: `CreatePersonId`, `ModifyPersonId`, `CreateDateTime`, `ModifyDateTime`
- No cascading FK actions; no triggers; unique indexes over unique constraints
- Use `rowversion` for optimistic concurrency
- **Domain tables over CHECK constraints** for named value sets — `tinyint` PK, no audit columns, no `IDENTITY`; pair every domain table with a data script for dacpac post-deployment seeding

### Data Types
- `decimal(19,4)` for money (never `money` type)
- `nvarchar` for Unicode text; `nvarchar(254)` for email; `nvarchar(2083)` for URLs
- **`datetime2` is the default datetime type** — UTC storage is implied by convention; use `SYSUTCDATETIME()` for defaults
- **Non-UTC columns must signal this explicitly** in the name: `AppointmentLocalDateTime` (`datetime2`), `EventOffsetDateTime` (`datetimeoffset`)
- `date`/`time` when only date or time component is needed
- `bit` for booleans; no `text`/`ntext`/`image` (deprecated)
- Right-size columns; avoid `(n)varchar(MAX)` unless truly needed

### Code Patterns
- `SET NOCOUNT, XACT_ABORT ON;` in all stored procedures
- Use UPSERT with `UPDLOCK, SERIALIZABLE` (never IF EXISTS/UPDATE/ELSE/INSERT)
- `THROW` not `RAISERROR`; TRY/CATCH for transactions
- `sp_executesql` not `EXECUTE()` for dynamic SQL
- `EXISTS` not `NOT IN`; keep WHERE expressions SARGable
- Temp tables over table variables; parameterize all queries
- No `NOLOCK` - use RCSI instead
- **Soft deletes**: tables with `ValidToDateTime` must never use `DELETE` — set `ValidToDateTime` to close the record; subtype rows inherit lifecycle from parent in TPT
- **UPDATE OUTPUT**: use `OUTPUT deleted.*/inserted.*` to capture prior and new values in one pass — never SELECT-UPDATE-SELECT
- **Consolidate reads**: fetch all needed columns from the same row in a single SELECT, not multiple queries

### Environment
- Retry logic for transient errors; RCSI for concurrency
- 3-tier connection strings (write, read-recent, read-delayed)
- No `db_owner` for apps; contained database users
- Never use SQL Server as message queue or email sender

## Detailed References

Read these files when you need deeper guidance on a specific topic:

- **[references/naming-conventions.md](references/naming-conventions.md)** - Complete naming rules for all object types, including DateTime column naming and UTC convention
- **[references/table-conventions.md](references/table-conventions.md)** - Table design, indexes, keys, normalization, audit columns, domain tables
- **[references/domain-table-data-scripts.md](references/domain-table-data-scripts.md)** - Domain table data script pattern, file location, `.sqlproj` wiring, and post-deployment setup
- **[references/data-type-conventions.md](references/data-type-conventions.md)** - Data type selection, right-sizing, and UTC datetime convention
- **[references/sql-code-conventions.md](references/sql-code-conventions.md)** - T-SQL patterns, UPSERT, error handling, dynamic SQL, SARGability
- **[references/data-conventions.md](references/data-conventions.md)** - Data integrity, purging, encryption, tombstone patterns, domain table seeding
- **[references/environment-conventions.md](references/environment-conventions.md)** - Connection strings, RCSI, security, schema drift
- **[references/formatting-rules.md](references/formatting-rules.md)** - Complete formatting specification (PRECEDENCE over all other formatting)
- **[references/formatting-examples.sql](references/formatting-examples.sql)** - Formatted SQL examples demonstrating all formatting rules
