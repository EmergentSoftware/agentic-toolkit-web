-- Example 1: Simple Query 
SELECT
   ord.OrderId,
   ord.OrderDate,
   cst.CustomerName,
   prd.ProductName,
   odd.Quantity,
   odd.UnitPrice,
   odd.Quantity * odd.UnitPrice AS TotalPrice
FROM dbo.Orders       ord
JOIN dbo.Customers    cst ON ord.CustomerId = cst.Id
JOIN dbo.OrderDetails odd ON ord.OrderId   = odd.OrderId
JOIN dbo.Products     prd ON odd.ProductId = prd.Id
WHERE ord.OrderDate >= '2024-01-01'
AND   ord.Status    = 'Completed'
ORDER BY ord.OrderDate DESC;

-- Example 2: Subquery with EXISTS 
SELECT
   cst.CustomerId,
   cst.CustomerName,
   cst.Email
FROM  dbo.Customers cst
WHERE EXISTS (
   SELECT
      1
   FROM  dbo.Orders ord
   WHERE ord.CustomerId = cst.CustomerId
   AND   ord.OrderDate  >= DATEADD(MONTH, -6, GETUTCDATE())  
   )
AND cst.Status = 'Active';

-- Example 3: Complex JOIN with Subquery 
SELECT
   ord.OrderId,
   ord.OrderDate,
   cst.CustomerName,
   ror.OrderCount
FROM dbo.Orders    ord
JOIN dbo.Customers cst ON ord.CustomerId = cst.Id
JOIN (
   SELECT
      ord.CustomerId,
      COUNT(*) AS OrderCount
   FROM  dbo.Orders  ord
   WHERE ord.OrderDate >= DATEADD(YEAR, -1, GETDATE())
   GROUP BY ord.CustomerId
   )                    AS ror ON cst.CustomerId = ror.CustomerId
WHERE ord.Status = 'Pending';

-- Example 4: Simple Stored Procedure 
CREATE PROCEDURE dbo.GetCustomerOrders (
   @CustomerId INT,
   @StartDate  DATE,
   @EndDate    DATE
)
AS
BEGIN
   SET NOCOUNT ON;

   -- STEP 1: Validate parameters 
   IF @CustomerId IS NULL
      THROW 50001, 'CustomerId cannot be null', 1;

   -- STEP 2: Return customer orders 
   SELECT
      ord.OrderId,
      ord.OrderDate,
      ord.Status,
      ord.TotalAmount
   FROM  dbo.Orders ord
   WHERE ord.CustomerId = @CustomerId
   AND   ord.OrderDate BETWEEN @StartDate AND @EndDate
   ORDER BY ord.OrderDate DESC;
END;

-- Example 5: Transactional Stored Procedure 
CREATE PROC dbo.ProcessOrder (
   @OrderId    INT,
   @CustomerId INT,
   @ProductId  INT,
   @Quantity   INT
)
AS
BEGIN
   SET NOCOUNT, XACT_ABORT ON;

   DECLARE 
      @Price            DECIMAL(10, 2)
      @NewOrderDetailId INT;

   BEGIN TRY
      BEGIN TRANSACTION;

      -- STEP 1: Get product price 
      SELECT
         @Price = prd.UnitPrice
      FROM  dbo.Products prd
      WHERE prd.ProductId = @ProductId;

      IF @Price IS NULL
         THROW 50001, 'Product not found', 1;

      -- STEP 2: Create order if needed 
      IF @OrderId IS NULL
      BEGIN
         INSERT INTO dbo.Orders (
            CustomerId,
            OrderDate,
            Status
         )
         VALUES (
            @CustomerId,
            GETDATE(),
            'Pending'
         );

         SET @OrderId = SCOPE_IDENTITY();
      END;

      -- STEP 3: Add order detail 
      INSERT INTO dbo.OrderDetails (
         OrderId,
         ProductId,
         Quantity,
         UnitPrice
      )
      VALUES (
         @OrderId,
         @ProductId,
         @Quantity,
         @Price
      );

      -- STEP 4: Update inventory 
      UPDATE prd SET
         prd.StockQuantity = prd.StockQuantity - @Quantity
      FROM dbo.Products prd
      WHERE prd.ProductId = @ProductId;

      COMMIT TRANSACTION;

      SELECT
         @OrderId AS OrderId;
   END TRY
   BEGIN CATCH
      IF @@TranCount > 0
         ROLLBACK TRANSACTION;

      THROW;
   END CATCH;
END;

-- Example 6: Multi-condition JOINs 
SELECT
   emp.EmployeeId,
   emp.EmployeeName,
   dep.DepartmentName,
   mgr.ManagerName
FROM dbo.Employees      emp
JOIN dbo.Departments    dep ON emp.DepartmentId = dep.DepartmentId
                           AND emp.Location     = dep.Location
LEFT JOIN dbo.Employees mgr ON emp.ManagerId    = mgr.EmployeeId
                           AND mgr.Status       = N'Active'
WHERE emp.Status = N'Active';

-- Example 7: CREATE TABLE with conventions
-- DEFAULT constraints are inline with the column definition.
-- All datetime columns use datetime2 with SYSUTCDATETIME() (UTC storage; application handles timezone conversion).
CREATE TABLE dbo.Product
(
   ProductId          int            NOT NULL IDENTITY(1, 1),
   ProductName        nvarchar(200)  NOT NULL,
   ProductDescription nvarchar(400)  NULL,
   RegularPrice       decimal(19, 4) NOT NULL,
   IsActive           bit            NOT NULL CONSTRAINT dbo_Product_IsActive_Default       DEFAULT (1),
   CreatePersonId     int            NOT NULL,
   ModifyPersonId     int            NOT NULL,
   CreateDateTime     datetime2      NOT NULL CONSTRAINT dbo_Product_CreateDateTime_Default DEFAULT (SYSUTCDATETIME()),
   ModifyDateTime     datetime2      NOT NULL CONSTRAINT dbo_Product_ModifyDateTime_Default DEFAULT (SYSUTCDATETIME()),
   VersionStamp       rowversion     NOT NULL,
   CONSTRAINT dbo_Product_ProductId PRIMARY KEY CLUSTERED (ProductId ASC),
   CONSTRAINT dbo_Product_ProductName UNIQUE NONCLUSTERED (ProductName ASC)
);

-- Example 8: Complex CTE with CROSS APPLY using variables

DECLARE
   @StartDate  date = '1970/01/01',
   @EndDate    date = '2055/12/31',
   @Difference int;

SELECT 
   @Difference = DATEDIFF(dd, @StartDate, @EndDate)+1;

WITH --his secton generates the number table 
E01(N) 
AS (
   SELECT 1 
   UNION ALL 
   SELECT 1
),
E02(N) 
AS (
   SELECT 1 
   FROM E01       one
   CROSS JOIN E01 two
),
E04(N) 
AS (
   SELECT 1 
   FROM E02       one
   CROSS JOIN E02 two
),
E08(N) 
AS (
   SELECT 1 
   FROM E04       one
   CROSS JOIN E04 two
),
E16(N) 
AS (
   SELECT 1 
   FROM E08       one
   CROSS JOIN E08 two
),
E32(N) 
AS (
   SELECT 1 
   FROM E16       one
   CROSS JOIN E16 two
), 
Numbers(N) 
AS (
   SELECT ROW_NUMBER() OVER (ORDER BY N) 
   FROM E32
)
SELECT 
   CAST(fld.[DateKey] AS int) AS [DateKey],
   dts.[Date],
   fld.[DateTime],
   CAST(fld.[Year] as int)    AS [Year],
   fld2.[Quarter],
   fld2.[BillingPeriod] ,
   fld2.[Month],
   fld2.[MonthKey] ,

   fld3.[Week],
   fld3.[Day]
FROM (
   SELECT top(@Difference) 
      DATEADD(dd, N-1, @StartDate) AS [Date] 
   FROM Numbers num
) AS dts
CROSS APPLY (
   SELECT 
      CAST(CONVERT(VARCHAR(8), dts.[Date], 112) AS INT)     AS [DateKey],
      CAST(dts.[Date] AS DATETIME)                          AS [DateTime],
      CAST(DATEPART(YEAR, dts.[Date]) AS CHAR(4))           AS [Year],
      DATEPART(QUARTER, dts.[Date])                         AS [QuarterID],
      CAST(DATEPART(MONTH, dts.[Date]) AS varchar(2))       AS [MonthID],
      LEFT(DATENAME(MONTH, dts.[Date]), 3)                  AS [Month],
      CAST(DATEPART(DAY, dts.[Date]) AS varchar(2))         AS [DayID],
      DATEADD(dd, 1-DATEPART(dw, dts.[Date]), dts.[Date])   AS [FirstWeek]
) AS fld 
CROSS APPLY (
   SELECT 
      fld.[Year] + '-Q' + CAST(fld.[QuarterID] AS CHAR(1))  AS [Quarter],
      fld.[Year] + '-' + fld.[Month]                        AS [Month],
      fld.[Year] + '-' + CASE LEN(fld.[MonthID]) WHEN 1 THEN '0' ELSE '' END + 
         fld.[MonthID] + 'BP' + CASE WHEN fld.[DayID] <= 15 THEN '1' ELSE '2' END  
                                                            AS [BillingPeriod],
      fld.[Year] +   CASE LEN(fld.[MonthID]) WHEN 1 THEN '0' ELSE '' END + 
         fld.[MonthID]                                      AS [MonthKey]
) AS fld2   
CROSS APPLY (
   SELECT 
      fld.[Year] + '-' +
         CASE LEN(fld.[MonthID]) WHEN 1 THEN '0' ELSE '' END + 
         fld.[MonthID] + '-' + 
         CASE LEN(fld.[DayID]) WHEN 1 THEN '0' ELSE '' END + 
         fld.[DayID]                                        AS [Day],
      CAST(YEAR(fld.[FirstWeek]) AS CHAR(4)) + '-WK-' +
         CASE LEN(CAST(MONTH(fld.[FirstWeek]) AS varchar(2))) WHEN 1 THEN '0' ELSE '' END + 
         CAST(MONTH(fld.[FirstWeek]) AS varchar(2)) + '/' + 
         CASE LEN(CAST(DATEPART(dd,fld.[FirstWeek]) AS varchar(2))) WHEN 1 THEN '0' ELSE '' END + 
         CAST(DATEPART(dd,fld.[FirstWeek]) AS varchar(2))   AS [Week]
) AS fld3   
