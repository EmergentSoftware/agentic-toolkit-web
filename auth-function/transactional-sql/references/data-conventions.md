# Data Conventions

## No Placeholder Rows
- Never create empty rows to "hold the place" of possible future data
- Insert rows only when data is materialized
- Placeholder rows waste space, add overhead, and muddy queries with `IS NOT NULL` / `LEN() > 0` checks

## Data Encryption
- Encrypt data as required by compliance (GDPR, HIPAA, SOX)
- Options: Always Encrypted, Transparent Data Encryption (TDE), connection encryption
- Determine if protection is needed at rest, in transit, or both

## Environment-Agnostic Queries
- Never hard-code values (IDs, names, lists) that change over time
- Use data-driven design with database tables for dynamic values
- Hard-coded values create rigid, error-prone code requiring manual updates

## Soft Deletes (Effectivity Pattern)
- Tables with `ValidFromDateTime` / `ValidToDateTime` columns must use soft deletes — **never `DELETE FROM`**
- Set `ValidToDateTime = SYSUTCDATETIME()` to close a record; the row remains for audit and lineage
- In TPT inheritance, soft-close the **parent** table only — subtype rows inherit lifecycle from the parent and should not be deleted
- All read queries must include `WHERE ValidToDateTime IS NULL` to filter out closed records
- See also: `references/sql-code-conventions.md` > "Soft Deletes via Effectivity Columns"

## Data Purging
- Define retention policies with stakeholders (legal, regulatory requirements)
- Ensure purging doesn't break foreign keys, audit trails, or reports
- Create supporting indexes (e.g., on `CreateDateTime`)
- **Always purge in batches** to avoid lock escalation and deadlocks
- Use `DELETE TOP (1000)` in a loop with `ROWLOCK` hint
- Optionally OUTPUT deleted rows to archive table
- Hard `DELETE` is reserved for purging, correcting pre-consumption data-entry errors, or staging/temp table cleanup — not for business-logic "remove" operations

## Tombstone Row Pattern (Id = -1)
- Use a reserved "tombstone" parent row (Id = -1) for deleted parent references
- Preserves FK integrity when parent records are deleted for compliance/lifecycle
- Keeps child table FK columns NOT NULL and historical data queryable
- Same concept as Kimball's missing/unknown key pattern

## Domain Table Seed Data
- Every domain table must have a corresponding data script seeded via dacpac post-deployment
- Data scripts are idempotent and re-runnable — safe on fresh databases and repeat deployments
- See **[references/domain-table-data-scripts.md](domain-table-data-scripts.md)** for the
  full script pattern, file location convention, and `.sqlproj` wiring
