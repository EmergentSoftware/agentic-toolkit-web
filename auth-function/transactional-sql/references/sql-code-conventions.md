# SQL Code Conventions

## Source Control
- All database objects must be in source control
- Each developer should have their own database copy
- Consider keeping database project separate from application code

## SET Options
- Always use `SET NOCOUNT ON;` in stored procedures
- Always use `SET XACT_ABORT ON;` in stored procedures (especially with transactions)
- Combined: `SET NOCOUNT, XACT_ABORT ON;`

## UPSERT Patterns
Never use the naive IF EXISTS/UPDATE/ELSE/INSERT pattern - it causes race conditions.

**When UPDATE is more likely:**
```sql
SET NOCOUNT, XACT_ABORT ON;
BEGIN TRY
   BEGIN TRANSACTION;

   UPDATE prs SET 
      FirstName = 'Kevin'
   FROM dbo.Person prs WITH (UPDLOCK, SERIALIZABLE)
   WHERE prs.LastName = 'Martin';
   
   IF @@ROWCOUNT = 0
   BEGIN
      INSERT dbo.Person (
         FirstName, 
         LastName
         ) 
      VALUES (
         'Kevin', 
         'Martin'
         );
   END;
   
   COMMIT TRANSACTION;

END TRY
BEGIN CATCH
   IF @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
   THROW;
END CATCH;
```

**When INSERT is more likely:**
```sql
SET NOCOUNT, XACT_ABORT ON;
BEGIN TRY
   BEGIN TRANSACTION;
   
   INSERT dbo.Person (
      FirstName,
      LastName
      )
   SELECT 
      'Kevin', 
      'Martin'
   WHERE NOT EXISTS (
      SELECT 1
      FROM dbo.Person WITH (UPDLOCK, SERIALIZABLE)
      WHERE LastName = 'Martin'
   );

   IF @@ROWCOUNT = 0
   BEGIN
      UPDATE prs SET 
         FirstName = 'Kevin'
      FROM dbo.Person prs 
      WHERE prs.LastName = 'Martin';
   END;
   COMMIT TRANSACTION;
END TRY
BEGIN CATCH
   IF @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
   THROW;
END CATCH;
```

**MERGE** - Avoid in OLTP databases. Acceptable in ETL only when not run concurrently.

## IF EXISTS Before DML
- Don't use `IF EXISTS` followed by `UPDATE`/`DELETE` - causes race conditions
- The DML statement itself handles non-matching rows (UPDATE does nothing if no rows match)
- If the check is essential, use `WITH (UPDLOCK, HOLDLOCK)` inside a transaction

## Parameterized Queries
- Always parameterize queries - prevents SQL injection and enables execution plan reuse
- Never concatenate user input into SQL strings

## Cursors
- Avoid cursors; use set-based operations, window functions, or CROSS/OUTER APPLY
- Valid use cases: executing complex stored procedures per row, import scripts
- If needed: `DECLARE MyCursor CURSOR LOCAL FAST_FORWARD FOR`
- Always CLOSE and DEALLOCATE

## Temporary Tables vs Table Variables
- Prefer temporary tables (`#TempTable`) over table variables (`@TableVar`)
- Table variables lack statistics and don't scale
- Table variables only for: highly-called code with recompile issues, or audit data that survives rollback

## Dynamic SQL
- Use `sp_executesql` with parameters, never `EXECUTE()` / `EXEC()`
- `EXECUTE()` cannot use parameterized queries, risks SQL injection, and can't reuse execution plans

## Error Handling
- Use `THROW` (not `RAISERROR`) for re-throwing errors
- Use `TRY...CATCH` blocks for transaction safety
- Always check `@@TRANCOUNT > 0` before ROLLBACK in CATCH block

```sql
BEGIN TRY
   BEGIN TRANSACTION;
   -- operations
   COMMIT TRANSACTION;
END TRY
BEGIN CATCH
   IF @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
   THROW;
END CATCH;
```

## NOLOCK / READ UNCOMMITTED
- Never use `NOLOCK` or `READ UNCOMMITTED` hints
- They cause dirty reads, phantom reads, and missing/duplicate rows
- Use Read Committed Snapshot Isolation (RCSI) instead

## SARGable Expressions
- Keep WHERE clause expressions SARGable (Search ARGument able) for index usage
- Don't wrap columns in functions: `WHERE YEAR(CreateDate) = 2024` is non-SARGable
- Do this instead: `WHERE CreateDate >= '2024-01-01' AND CreateDate < '2025-01-01'`
- Don't use leading wildcards: `WHERE Name LIKE '%son'` is non-SARGable
- Don't apply math to columns: `WHERE Column + 1 = @Value` is non-SARGable

## EXISTS vs NOT IN
- Use `EXISTS` or `NOT EXISTS` instead of `IN` or `NOT IN` with subqueries
- `NOT IN` fails silently with NULLs (returns no rows if any NULL exists in the subquery)

## Semicolons
- Required at the end of every statement
- Required before `THROW` when it's the first statement in a block
- Required before `WITH`

## BEGIN...END Blocks
- Always use `BEGIN...END` with `IF`, `ELSE`, `WHILE` (even for single statements for clarity)
- Exception: Single-statement IF where it's clearly readable

## Table Aliases
- Always use short, meaningful aliases for tables in multi-table queries
- When possible, use three character lower case aliases for the same tables throughout code to assist with clarity  
- No need to use the optional `AS`: `FROM dbo.Person   prs`

## Column Lists
- Always specify column lists in INSERT statements (never `INSERT INTO Table VALUES (...)`)
- Always specify column names in SELECT (avoid `SELECT *` in production code)

## ORDER BY
- Avoid ORDER BY in SQL when possible - sort in the application tier instead
- A notable exception would be for code which is returning paginated and offset results 

## Dynamic Search / Catch-All Queries
- For optional parameters, use `OPTION (RECOMPILE)` for simple queries
- For complex queries, build dynamic SQL with `sp_executesql`
- Don't use IF branches for optional parameters (query plan is already compiled)

## Brackets
- Don't use square brackets `[]` on valid object names
- Only use brackets for names that are reserved words or contain special characters

## Window Functions
- Use `ROWS BETWEEN` instead of `RANGE BETWEEN` (better performance)

## Unicode String Literals
- Prefix string literals with `N` when inserting into `nvarchar` columns: `N'text'`

## Select Column Aliases 
- Do not use the `MyAlias = tab.ColumnName` syntax in select statements
- Instead use the `tab.ColumnName AS MyAlias` syntax

## Operation syntax 
- Do not use the != syntax, `tab.ColumnOne != tab.ColumnTwo`
- Instead use the <> syntax `tab.ColumnOne <> tab.ColumnTwo`

## Soft Deletes via Effectivity Columns
- When a table has `ValidFromDateTime` / `ValidToDateTime` columns, **never use `DELETE`** — set `ValidToDateTime` to close the record
- This preserves audit history, FK integrity, and lineage traceability
- Subtype tables in a TPT hierarchy (e.g. `EmailAddress`, `PhoneNumber`, `PostalAddress` under `ContactPoint`) inherit lifecycle from the parent — soft-close the parent, leave subtypes untouched
- All queries reading these tables must filter with `WHERE ValidToDateTime IS NULL` to exclude closed records
- When `IsPreferred`-style flags are updated, include `AND ValidToDateTime IS NULL` in the WHERE clause to avoid toggling flags on closed records
- Hard `DELETE` is only appropriate for: data purging (with retention policy), correcting data-entry errors before downstream consumption, or removing rows from staging/temp tables

## UPDATE with OUTPUT — Collapse Multi-Pass Reads
- When you need both the **prior** and **new** values from an UPDATE (e.g. for audit/lineage), use `OUTPUT deleted.*` / `OUTPUT inserted.*` to capture them in one pass
- Never use a SELECT-then-UPDATE-then-SELECT pattern — it hits the table three times and widens the lock window inside transactions
- `OUTPUT INTO @TableVar` is required when the results feed into subsequent logic (SQL Server doesn't support `OUTPUT` directly into scalar variables)
- `deleted.*` columns reflect pre-update values; `inserted.*` columns reflect post-update values
- Clean up the table variable (`DELETE FROM @OutputTable`) between loop iterations when reusing inside a cursor

```sql
-- Anti-pattern: 3 passes on the same row
SELECT @PriorValue = col FROM tbl WHERE Id = @Id;
UPDATE tbl SET col = @NewValue WHERE Id = @Id;
SELECT @DisplayValue = otherCol FROM tbl WHERE Id = @Id;

-- Correct: 1 pass with OUTPUT
DECLARE @Out TABLE (PriorValue int, DisplayValue nvarchar(200));

UPDATE tbl
SET col = @NewValue
OUTPUT deleted.col, inserted.otherCol
INTO @Out (PriorValue, DisplayValue)
WHERE Id = @Id;

SELECT @PriorValue = PriorValue, @DisplayValue = DisplayValue FROM @Out;
```

## Consolidating Reads on the Same Row
- When multiple scalar values are needed from the same row, fetch them in a single SELECT rather than separate queries
- Use CASE expressions with correlated subqueries to read a parent row and its subtype data in one pass when the subtype is determined by a discriminator column

```sql
-- Anti-pattern: 2 separate reads
SELECT @TypeId = TypeId FROM dbo.Parent WHERE ParentId = @Id;
SELECT @Value = val FROM dbo.ChildA WHERE ParentId = @Id;

-- Correct: 1 combined read
SELECT
   @TypeId = p.TypeId,
   @Value = CASE p.TypeId
      WHEN 1 THEN (SELECT ca.val FROM dbo.ChildA ca WHERE ca.ParentId = p.ParentId)
      WHEN 2 THEN (SELECT cb.val FROM dbo.ChildB cb WHERE cb.ParentId = p.ParentId)
   END
FROM dbo.Parent p
WHERE p.ParentId = @Id;
```

## Breaking Down Complex Queries
Split into multiple steps when you have:
- OR logic joining different tables in WHERE/JOIN
- Aggregations in intermediate result sets
- Large number of complex joins
- CASE in WHERE or JOIN clauses
Use temp tables for intermediate results to let optimizer build statistics.
