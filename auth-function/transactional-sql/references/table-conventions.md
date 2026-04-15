# Table Conventions

## Normalization
- Normalize to at least Boyce-Codd Normal Form (BCNF / 3.5NF)
- Avoid denormalization unless you have a compelling reason
- "Normalize until it hurts, denormalize until it works" leads to eventual issues
- Use indexes, materialized views, and query rewriting for performance instead of denormalization
- If denormalized, use strong consistency (transactions) not eventual consistency

## Inheritance
- Use Table Per Type (TPT) pattern
- TPT is performant with proper indexes into hundreds of millions of rows
- Avoid Table Per Hierarchy (TPH) and Table Per Concrete (TPC) - they violate normal form

## Entity-Attribute-Value (EAV)
- Avoid EAV except for: user preferences, UI config, user-defined attributes, multi-type product catalogs
- EAV is an anti-pattern (inner-platform effect) for relational data

## Keys
- Every table must have a primary key
- Use surrogate keys (identity/auto-increment) for PKs
- Put natural keys in unique constraints to guarantee uniqueness
- Avoid `uniqueidentifier/guid` as PKs (4x wider than INT, not user-friendly)
- Never use `uniqueidentifier/guid` in clustered indexes (causes bad page splits)

## Weak vs Strong Tables
- Weak tables (exist only with owner): Reference parent directly (`PersonPhone` has `PersonId` FK)
- Strong tables (exist independently): Use linking/junction tables (`PersonAddress` links `Person` and `Address`)

## Indexes
- Every table must have a clustered index (no heaps)
- Aim for ~5 indexes per table, ~5 columns per index
- Create indexes on all foreign key columns (in primary key position)
- Use unique constraints instead of unique indexes (want explicit behavior)
- Do not use table partitions for query performance - use indexes instead
- Partitions are for maintenance (hot/cold storage, partition switching)
- Include filtered columns in `INCLUDE()` to avoid key lookups
- Default fill factor (100/0) is recommended; only lower when needed for specific page-split patterns
- Delete disabled indexes instead of keeping them disabled

## Foreign Keys
- No cascading actions (`ON DELETE CASCADE`, `ON UPDATE CASCADE`) - use stored procedures instead
- Cascading actions take serializable locks (RANGEX-X) and perform slowly
- Always explicitly specify `NULL` or `NOT NULL` for columns
- Nullable FK columns prevent JOIN elimination - avoid when possible
- Re-enable constraints with `WITH CHECK CHECK CONSTRAINT` after bulk loads
- Untrusted constraints hurt query optimizer performance

## Audit Columns
- Always include audit columns: `CreateUserId`, `ModifyUserId`, `CreateDateTime`, `ModifyDateTime`
- May use `ValidFromDateTime`, `ValidToDateTime` instead for cases where effectivity is needed
- Exclude subtype tables from needing separate tracking columns
- Use application code or stored procedures to update (not triggers)
- `ModifyDateTime` is critical in a transactional schema for ETL/DW incremental processing and system integrations

## Sort Direction
- Always explicitly specify `ASC` or `DESC` on index columns and ORDER BY

## Triggers
- Avoid triggers - they add overhead, hide logic, and complicate debugging
- Triggers cause EF Core issues with OUTPUT clauses
- Use stored procedures or application logic instead

## Optimistic Concurrency
- Use `rowversion` column for optimistic concurrency control
- Include `VersionStamp` in UPDATE WHERE clause to prevent "last UPDATE wins"

## Wide Tables
- More than 20 columns suggests the table needs redesign

## Temporal Tables
- Ensure history table uses PAGE compression

## Domain Tables (Typed Lookup / Reference Tables)

Domain tables replace `CHECK` constraints when a column's allowed values form a meaningful,
named set. They make the value domain explicit, queryable, and FK-enforced rather than
embedded as string literals in a constraint.

### When to use a domain table vs. a CHECK constraint

Use a **domain table** when:
- The column's allowed values have identity — a name meaningful to users or application code
- The same value set is shared across more than one table or column
- The values may eventually need display labels, sort orders, or descriptions
- The set is stable but conceivably extensible (e.g. a new status could be added without a code-breaking schema change)

Keep a **CHECK constraint** when:
- Values are directly consumed by engine or algorithm code and must never be extended without a corresponding code change
- The column is on a system-computed table (e.g. confidence scores, verification status written by a pipeline)
- The set is binary or near-binary and purely structural (e.g. a `SOURCE` / `MASTER` discriminator)

### Structure

```sql
CREATE TABLE schema.ContactType
(
   ContactTypeId   tinyint      NOT NULL,
   ContactTypeName nvarchar(20) NOT NULL,
   CONSTRAINT schema_ContactType_ContactTypeId PRIMARY KEY CLUSTERED (ContactTypeId ASC),
   CONSTRAINT schema_ContactType_ContactTypeName UNIQUE NONCLUSTERED (ContactTypeName ASC)
);
```

- **PK type**: `tinyint` for small fixed sets (≤ 255 rows); `smallint` if the set could realistically grow beyond that
- **PK value**: manually assigned integer — not `IDENTITY`. Values are stable seed-data identifiers referenced by application code and default constraints
- **Minimum columns**: `[TableName]Id` and `[TableName]Name`; add `Description`, `SortOrderNumber`, `IsActive` only when genuinely needed by consumers
- **No audit columns, no `VersionStamp`**: domain table rows are deployment-time seed data, not user-editable records
- **Unique constraint on the name column**: enforces name uniqueness independently of the PK

### Naming

- Table name is singular and describes the domain: `ContactType`, `NameType`, `LinkStatus`, `DecisionBand`
- PK column: `[TableName]Id` — follows the standard PK convention
- Name column: `[TableName]Name`
- FK column in referencing table matches the PK name exactly: `ContactTypeId`
- FK constraint name: `[FK-SCHEMA]_[FK-TABLE]_[FK-COL]_[PK-SCHEMA]_[PK-TABLE]`
  e.g. `mdm_ContactPoint_ContactTypeId_mdm_ContactType`

### Replacing a CHECK constraint column with a domain table FK

```sql
-- Before: string column with CHECK constraint
ContactType   nvarchar(10) NOT NULL,
CONSTRAINT schema_Table_ContactType_Values CHECK (ContactType IN (N'EMAIL', N'PHONE')),

-- After: tinyint FK column
ContactTypeId tinyint NOT NULL,
CONSTRAINT schema_Table_ContactTypeId_schema_ContactType FOREIGN KEY (ContactTypeId) REFERENCES schema.ContactType (ContactTypeId)
```

For columns with a meaningful default, express it as the integer ID of the intended default row:

```sql
MasterStatusId tinyint NOT NULL CONSTRAINT schema_MasterContact_MasterStatusId_Default DEFAULT (1),
```

Column renames from the string form to the `Id` form require refactor log entries —
see the `database_sdk_refactorlog` skill.

### Seeding — data scripts

Every domain table must have a corresponding data script deployed via the dacpac
post-deployment process. See
**[references/domain-table-data-scripts.md](domain-table-data-scripts.md)** for the
full pattern including file location, naming, script structure, and `.sqlproj` wiring.
