# SQL Server Formatting Rules

These formatting rules take precedence over any conflicting conventions from other sources.

## Reserved Words
UPPERCASE: SELECT, FROM, WHERE, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, BEGIN, END, JOIN, INNER, LEFT, RIGHT, OUTER, ON, AND, OR, AS, SET, DECLARE, IF, ELSE, TRY, CATCH, THROW, ROLLBACK, COMMIT, TRANSACTION, EXISTS, IN, NOT, NULL, VALUES, INTO, GROUP BY, ORDER BY, HAVING, TOP, DISTINCT, UNION

## Data Types
lowercase: int, bigint, smallint, tinyint, bit, decimal, numeric, float, real, money, smallmoney, char, varchar, nchar, nvarchar, text, ntext, binary, varbinary, image, date, time, datetime, datetime2, datetimeoffset, smalldatetime, uniqueidentifier, xml, sql_variant, rowversion, cursor, table, hierarchyid, geometry, geography

## Indentation
- Base: 3 spaces per level
- SELECT columns: +1 level from SELECT even if additional clause like `DISTINCT` or `TOP (100)` on same line with SELECT
- INSERT columns: +1 level from INSERT
- JOIN clauses: same level as FROM
- JOIN conditions (multi-line): +1 level from JOIN
- Subquery contents: +1 level from parentheses
- IF/TRY/CATCH blocks: +1 level from keyword

## Object Names
- No square brackets on valid names: `dbo.TableName` not `[dbo].[TableName]`
- Only use brackets for reserved words or names with special characters

## Commas
Trailing position (end of line):
```sql
SELECT
   Field1,
   Field2,
   Field3
```

## Semicolons
Required at statement end:
```sql
SET NOCOUNT ON;
SELECT @Value = 1;
```

## Aliases
Always use `AS` for clarity and alignment padding: (for lines which are longer than most add alias on next line and align with shorter rows rather than aligning with an aliases on the end of  outlier row)
```sql
SELECT
   LongFieldName AS Alias1,
   ShortName     AS Alias2,
   CASE 
      WHEN somecolumn = N'somevalue' THEN 'This'
      ELSE 'That'
   END           AS Alias3, 
   IIF( somecolumn = N'someothervalue', 'Thisotherthing', 'Thatotherthing')
                 AS Alias4
```


## JOINs
### Types - leave out optional qualifier 
- `JOIN` (not `INNER JOIN`)
- `LEFT JOIN` (not `LEFT OUTER JOIN`)
- `RIGHT JOIN` (not `RIGHT OUTER JOIN`)
- `FULL JOIN` (not `FULL OUTER JOIN`)

### Single Condition
```sql
FROM Orders    ord
JOIN Customers cst ON ord.CustomerId = cst.Id
```

### Multiple Conditions
```sql
FROM Orders    ord
JOIN Customers cst ON ord.CustomerId = cst.Id
                  AND ord.Status = cst.DefaultStatus
```

## Parentheses Structure
Own lines for subqueries, EXISTS/IN, proc parameters, CREATE TABLE columns, INSERT column lists:
```sql
WHERE EXISTS (
   SELECT 1
   FROM Table tbl
   WHERE tbl.Id = asp.Id
   )
```

## CREATE TABLE
- Column definitions use alignment padding on data type, nullability, and inline constraints
- **DEFAULT constraints are inline** with the column definition — never as separate table-level constraints
- Inline DEFAULT format: `CONSTRAINT schema_Table_Column_Default DEFAULT (value)` immediately after `NOT NULL`/`NULL`
- Table-level constraints (PRIMARY KEY, UNIQUE, FOREIGN KEY, CHECK) follow all column definitions
- Column order: name, data type, nullability, inline DEFAULT (if any), then next column

```sql
CREATE TABLE schema.TableName
(
   TableNameId    int           NOT NULL IDENTITY(1, 1),
   ColumnName     nvarchar(100) NOT NULL,
   NullableColumn nvarchar(400) NULL,
   IsActive       bit           NOT NULL CONSTRAINT schema_TableName_IsActive_Default       DEFAULT (1),
   CreateDateTime datetime2     NOT NULL CONSTRAINT schema_TableName_CreateDateTime_Default DEFAULT (SYSUTCDATETIME()),
   ModifyDateTime datetime2     NOT NULL CONSTRAINT schema_TableName_ModifyDateTime_Default DEFAULT (SYSUTCDATETIME()),
   VersionStamp   rowversion    NOT NULL,
   CONSTRAINT schema_TableName_TableNameId PRIMARY KEY CLUSTERED (TableNameId ASC),
   CONSTRAINT schema_TableName_ColumnName UNIQUE NONCLUSTERED (ColumnName ASC)
);
```

## Control Flow
### Single Statement
```sql
IF @Value = 1
    SELECT 1;
```

### Multiple Statements
```sql
IF @Value = 1
BEGIN
    SELECT 1;
    UPDATE Table SET Field = 1;
END
```

## Stored Procedures
### Basic Template
```sql
CREATE PROCEDURE schema.ProcedureName (
   @Parameter1 INT,
   @Parameter2 VARCHAR(50)
)
AS
BEGIN
   SET NOCOUNT ON;

   -- STEP 1: Description 
   -- code here

   -- STEP 2: Description 
   -- code here
END
```

### With Transaction
```sql
CREATE PROCEDURE schema.ProcedureName (
   @Parameter1 INT
)
AS
BEGIN
   SET NOCOUNT, XACT_ABORT ON;

   BEGIN TRY
      BEGIN TRANSACTION;

      -- STEP 1: Description 
      -- code

      COMMIT TRANSACTION;
   END TRY
   BEGIN CATCH
      IF @@TRANCOUNT > 0
         ROLLBACK TRANSACTION;

      THROW;
   END CATCH
END
```

## Comments
- Inline comments (`-- comment text`) for step descriptions
- Format: `-- STEP N: Description `
- Placement: Own line, aligned with code block
- Blank line before each step (except first)

## Whitespace
- Blank line after variable declarations
- Blank line before step comments (except first step)
- No blank line between step comment and first statement
- Blank line between major sections
