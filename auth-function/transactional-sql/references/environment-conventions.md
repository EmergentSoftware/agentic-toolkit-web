# Environment Conventions

## Connection Resilience
- Implement retry logic in application code for transient errors
- Use failover group or availability group listener names in connection strings (not specific server names)
- .NET 4.6.1+ / .NET Core: Use `SqlConnection` retry parameters
- EF: Configure execution strategies for connection resiliency

## Read Committed Snapshot Isolation (RCSI)
- Enable RCSI to resolve blocking and deadlocking issues
- RCSI is the default for Azure SQL databases
- With RCSI, readers don't block writers and vice versa
- Remove `NOLOCK` hints after enabling RCSI
- Test in lower environments first; monitor tempdb for version store pressure

## Security
- Never grant `db_owner` to application users - use `db_reader`, `db_writer`, `db_executor`
- Use contained database users (no server-level login required, makes database portable)
- All database objects should be owned by `dbo`
- Use group Managed Service Accounts (gMSA) for SQL Server service accounts

## Query Execution Defaults
- Maintain SSMS/VS defaults: `QUOTED_IDENTIFIER`, `ANSI_PADDING`, `ANSI_WARNINGS`, `ANSI_NULLS`, `ANSI_NULL_DFLT_ON` = ON
- Advanced: `ARITHABORT`, `CONCAT_NULL_YIELDS_NULL` = ON
- Required for indexed views and computed column indexes
- SET `ARITHABORT ON` in logon sessions (performance and correctness impact)

## Database Compatibility Level
- Match compatibility level to SQL Server version for query optimization benefits

## Relational Data
- Use RDBMS for relational data (customers, orders, products)
- NoSQL document databases lack schema enforcement, FK constraints, and efficient joins for relational data

## Connection Strings
- Use 3 tiers for scalability:
  1. **Writes + real-time reads** (`ApplicationIntent=ReadWrite`) - minimize queries here
  2. **Reads tolerating 15-second delay** (`ApplicationIntent=ReadOnly`) - default/majority
  3. **Reads tolerating hours delay** (`ApplicationIntent=ReadOnly`) - operational reporting
- Include `Application Name=AppName <team@domain.com>` for troubleshooting (up to 128 chars)

## Message Queuing
- Never use SQL Server Service Broker or database tables as a message queue
- Use dedicated systems: RabbitMQ, Azure Service Bus, Azure Storage Queues

## Database Drivers
- Use Microsoft OLE DB Driver for SQL Server (MSOLEDBSQL/MSOLEDBSQL19)
- Deprecated: SQLOLEDB, SQL Server Native Client (SNAC)

## Schema Drift
- Monitor for schema drift (target database deviating from source control baseline)
- Use source-controlled database projects to prevent

## Maintenance
- Remove unused database objects (rely on source control for history)
- Name temporary objects with `_DELETE_ME_AFTER_YYYY_MM_DD` pattern
- Do not use SQL Server to send emails (unreliable, poor troubleshooting)
- Do not use `sp_updatestats` (updates statistics even with single row modifications)
