# Data Type Conventions

## General Rules
- Right-size columns - oversized columns waste storage, memory, and hurt performance
- Match data types in JOINs and WHERE clauses to avoid implicit conversion
- Parameters and variables must match column data type, length, and precision
- Implicit conversion prevents index usage and wastes CPU

## Deprecated Types - Never Use
- `text` -> use `varchar(MAX)`
- `ntext` -> use `nvarchar(MAX)`
- `image` -> use `varbinary(MAX)`
- `timestamp` -> use `rowversion`

## String Types
- `nvarchar(128)` for database object names (matches `sysname`)
- `nvarchar(254)` for email addresses (RFC 2821 limit)
- `nvarchar(2083)` for URLs (IE max length)
- Use `nvarchar` (not `varchar`) for columns that may contain Unicode (names, addresses, international text)
- Avoid `(n)varchar(MAX)` unless data is known to exceed 8K (varchar) or 4K (nvarchar)
- `(n)varchar(MAX)` cannot be an index key and prevents index seeks

## Numeric Types
- `decimal(19, 4)` for money/currency (not `money` or `smallmoney` data types)
  - `money` has limited precision (underlying `bigint`), causes rounding errors in complex calculations
- `bit` for boolean columns
- `float`/`real` only for scientific use cases - use `decimal` for all other purposes
- Do not use `sql_variant` - it's for internal SQL Server use only
- Avoid user-defined data types - use simple data types instead

## Date/Time Types

### Default: UTC with datetime2
- **`datetime2`** is the default datetime type for all datetime columns
- All `datetime2` values are stored in **UTC** — this is implied by convention; no suffix is needed in the column name
- Default constraints use `SYSUTCDATETIME()` — never `GETDATE()` or `SYSDATETIME()` (both return local server time)
- The application layer is responsible for converting UTC to/from the user's local timezone at presentation time

```sql
CreateDateTime datetime2 NOT NULL CONSTRAINT mdm_TableName_CreateDateTime_Default DEFAULT (SYSUTCDATETIME()),
ModifyDateTime datetime2 NOT NULL CONSTRAINT mdm_TableName_ModifyDateTime_Default DEFAULT (SYSUTCDATETIME()),
```

### Non-UTC exceptions — explicit naming required
If a column intentionally stores a non-UTC value, the column name **must** include a suffix that signals this deviation from convention:
- **`LocalDateTime`** — stores a local time without timezone offset; use `datetime2` type (e.g., `AppointmentLocalDateTime`)
- **`OffsetDateTime`** — stores a time with an explicit timezone offset; use `datetimeoffset` type (e.g., `EventOffsetDateTime`)

These exceptions should be rare. Common cases: preserving a source system's local timestamp as-is, or storing a user-entered appointment time before UTC conversion occurs.

### When to use datetimeoffset
- Use `datetimeoffset` **only** when the offset itself is meaningful data that must be preserved alongside the time value
- Always pair with the `OffsetDateTime` column naming suffix to signal the deviation from the UTC convention
- Do not use `datetimeoffset` simply because users are in different timezones — that is handled by the application layer

### Other Date/Time Types
- `date` when time values are not required
- `time` when date values are not required
- `smalldatetime` when minute precision is acceptable and storage is a concern
- Avoid `datetime` — use `datetime2` instead (better precision, standards compliant)

## Sequence Objects
Use only when:
1. Guaranteed non-skipping sequential numbers needed
2. Same ID needed across multiple tables
3. Number recycling after max value
4. Non-numeric column needs sequential values
5. OVER window function scenarios
