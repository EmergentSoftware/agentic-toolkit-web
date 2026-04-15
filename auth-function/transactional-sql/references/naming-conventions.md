# Naming Conventions

## General Rules
- **PascalCase** for all database objects (tables, columns, indexes, constraints, parameters, variables)
- **Singular** table and view names (`Customer` not `Customers`) 
- **No prefixes**: Never use `tbl_`, `sp_`, `fn_`, `FK_`, `PK_`, `IX_`, `UK_`, `UX_`, `fld_`, `col_`
- **No special characters or spaces** in names
- **No numbers** in table names (flags denormalization like `Year2017`, `Year2018`)
- **No abbreviations**: Use `Account` not `Acct`, `Hour` not `Hr`
- **No reserved words** as object names
- **Do not** let SQL Server generate object names (constraints, indexes) - always name explicitly

## Primary Keys
- Format: `[TableName]Id` (e.g., `PersonId`, `InvoiceId`)
- Never use just `Id` - it causes confusion in JOINs and masks errors
- Constraint name format: `[SCHEMA]_[TABLE]_[COLUMN]` (e.g., `dbo_Invoice_InvoiceId`)

## Foreign Keys
- Column name must match parent table's PK column name (e.g., `CustomerId` in both `Customer` and `Order` tables)
- Exception: Multiple FKs to same table use descriptive prefix (`HomeAddressId`, `WorkAddressId`)
- Relationship name format: `[FK-SCHEMA]_[FK-TABLE]_[PK-SCHEMA]_[PK-TABLE]` (e.g., `Invoice_Product`)
- Multiple FKs to same table: Include context (`dbo_Invoice_ShippingAddress`, `dbo_Invoice_BillingAddress`)
- Non-PK reference: `[FK-SCHEMA]_[FK-TABLE]_[CHILD-COL]_[PK-SCHEMA]_[PK-TABLE]_[PARENT-COL]` (avoid and use primary key references instead)

## Indexes
- Format: `[SCHEMA]_[TABLE]_[COL1]_[COL2...]` (e.g., `dbo_Person_FirstName_LastName`)
- With included columns: Append `_Includes` (e.g., `dbo_Person_FirstName_LastName_Includes`)
- GUID clustered indexes: Append `_INDEX_REBUILD_ONLY` for special maintenance handling

## Constraints
- Default: `[SCHEMA]_[TABLE]_[COLUMN]_Default` (e.g., `dbo_Person_ModifiedDateTime_Default`)
- Check: `[SCHEMA]_[TABLE]_[COLUMN]_[DESCRIPTION]` (e.g., `dbo_ProductItem_RegularPrice_Minimum`)
- Unique: Use unique constraints for clarity of purpose rather than simply unique indexes (`CONSTRAINT dbo_AddressType_AddressTypeName UNIQUE NONCLUSTERED`)

## Columns
- Use singular names
- Avoid repeating table name except for PKs and generic/class words
- Generic words (`Name`, `Description`, `Code`, `Type`, `Status`, `Amount`, `Date`) should be prefixed with context (`AccountNumber`, `ProductDescription`, `StateCode`)
- Boolean columns: Use affirmative names (`IsActive`, `IsDeleted`, `HasPermission`, `CanExport`) - never negative (`IsNotDeleted`)
- Audit columns: `CreatePersonId`, `ModifyPersonId`, `CreateDateTime`, `ModifyDateTime`
- Version: `VersionStamp` (rowversion)
- Temporal: `ValidFromDateTime`, `ValidToDateTime`
- URL columns: Use `URL` not `URI` in names

## DateTime Column Naming
- The `DateTime` suffix is the standard for all datetime columns (e.g., `CreateDateTime`, `ValidFromDateTime`)
- **UTC storage is implied by convention** — all `datetime2` columns store UTC values using `SYSUTCDATETIME()`; no suffix is needed to indicate UTC
- **Exception — non-UTC values**: If a column intentionally stores a non-UTC local time (e.g., a user-entered appointment time in their local timezone before conversion, or a source system value preserved as-is), append a suffix that makes the non-UTC nature explicit:
  - `LocalDateTime` — local time without timezone info (e.g., `AppointmentLocalDateTime`)
  - `OffsetDateTime` — use `datetimeoffset` type and name accordingly (e.g., `EventOffsetDateTime`)
- This convention means a bare `DateTime` suffix is always a clear signal to consumers that the value is UTC — no guessing required

## Parameters and Variables
- Prefix with `@` (never `@@` which is for system globals)
- PascalCase: `@FirstName`, `@SiteId`
- Match column names they represent (minus the `@`)
- Letters and numbers only

## Stored Procedures and Functions
- Name by entity + action: `ProductGet`, `OrderUpdate`, `PersonDelete`, `InvoiceUpsert`

## Junction/Many-to-Many Tables
- Use a descriptive word if one exists (`Subscription` instead of `NewspaperReader`)
- Otherwise concatenate: `Table1Table2` (no underscores)

## Column Same as Table
- Do not give a table the same name as one of its columns
- Exception: Generic class words like `AccountNumber` table with `AccountNumber` column
