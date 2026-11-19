/*
SQL practice against OrionTraining.
Run 00 and 01 first. Highlight ONE query at a time and press F5.
Do not run the whole file at once until you have read it.
*/
USE OrionTraining;
GO

/* 1. Objects you created */
SELECT s.name AS SchemaName, o.name AS ObjectName, o.type_desc
FROM sys.objects AS o
JOIN sys.schemas AS s ON s.schema_id = o.schema_id
WHERE s.name IN (N'ref', N'stg', N'dim', N'fact', N'rpt')
  AND o.type IN ('U', 'V', 'P')
ORDER BY s.name, o.type_desc, o.name;
GO

/* 2. SELECT — pick columns, TOP, ORDER BY. Do not use SELECT * in a report. */
SELECT TOP (20)
    f.BillingDoc,
    f.BillingItem,
    c.[Date] AS BillingDate,
    cu.CustomerName,
    p.PlantName,
    m.MaterialName,
    f.Quantity,
    f.UoM,
    f.NetAmount,
    f.UnitPrice
FROM fact.Sales AS f
JOIN dim.Calendar AS c  ON c.DateKey = f.DateKey
JOIN dim.Customer AS cu ON cu.CustomerCode = f.CustomerCode
JOIN dim.Plant    AS p  ON p.PlantCode = f.PlantCode
JOIN dim.Material AS m  ON m.MaterialCode = f.MaterialCode
ORDER BY c.[Date], f.BillingDoc, f.BillingItem;
GO

/* 3. WHERE — one plant, one month */
SELECT
    cu.CustomerName,
    m.MaterialName,
    SUM(f.Quantity)  AS Quantity,
    SUM(f.NetAmount) AS NetAmount
FROM fact.Sales AS f
JOIN dim.Calendar AS c  ON c.DateKey = f.DateKey
JOIN dim.Customer AS cu ON cu.CustomerCode = f.CustomerCode
JOIN dim.Material AS m  ON m.MaterialCode = f.MaterialCode
WHERE f.PlantCode = '1000'
  AND c.CalendarYear = 2026
  AND c.MonthNo = 3
GROUP BY cu.CustomerName, m.MaterialName
ORDER BY SUM(f.NetAmount) DESC;
GO

/* 4. GROUP BY — revenue by product group. HAVING keeps only large groups. */
SELECT
    m.ProductGroup,
    SUM(f.NetAmount) AS NetAmount,
    SUM(f.QtyMT)     AS QtyMT,
    SUM(f.QtyKWh)    AS QtyKWh
FROM fact.Sales AS f
JOIN dim.Material AS m ON m.MaterialCode = f.MaterialCode
GROUP BY m.ProductGroup
HAVING SUM(f.NetAmount) > 0
ORDER BY SUM(f.NetAmount) DESC;
GO

/* 5. LEFT JOIN — depots have no production. Inner join would hide them. */
SELECT
    p.PlantCode,
    p.PlantName,
    p.PlantRole,
    COUNT(f.ProdKey) AS ProductionRows
FROM dim.Plant AS p
LEFT JOIN fact.Production AS f ON f.PlantCode = p.PlantCode
GROUP BY p.PlantCode, p.PlantName, p.PlantRole
ORDER BY p.PlantCode;
GO

/* 6. CASE — bucket customers */
SELECT
    cu.CustomerName,
    SUM(f.NetAmount) AS NetAmount,
    CASE
        WHEN SUM(f.NetAmount) >= 150000000 THEN N'Large'
        WHEN SUM(f.NetAmount) >= 80000000 THEN N'Mid'
        ELSE N'Small'
    END AS SizeBand
FROM fact.Sales AS f
JOIN dim.Customer AS cu ON cu.CustomerCode = f.CustomerCode
GROUP BY cu.CustomerName
ORDER BY SUM(f.NetAmount) DESC;
GO

/* 7. CTE + window — monthly revenue and running total */
WITH monthly AS (
    SELECT
        c.YearMonth,
        c.MonthName,
        SUM(f.NetAmount) AS NetAmount
    FROM fact.Sales AS f
    JOIN dim.Calendar AS c ON c.DateKey = f.DateKey
    GROUP BY c.YearMonth, c.MonthName
)
SELECT
    YearMonth,
    MonthName,
    NetAmount,
    SUM(NetAmount) OVER (ORDER BY YearMonth) AS RunningNetAmount
FROM monthly
ORDER BY YearMonth;
GO

/* 8. Compare LPG sold with LPG produced, in MT. Safe to add because both are MT. */
WITH sales AS (
    SELECT c.YearMonth, SUM(f.QtyMT) AS SalesMT
    FROM fact.Sales AS f
    JOIN dim.Calendar AS c ON c.DateKey = f.DateKey
    WHERE f.QtyMT IS NOT NULL
    GROUP BY c.YearMonth
),
prod AS (
    SELECT c.YearMonth, SUM(f.ActualQtyMT) AS ProducedMT
    FROM fact.Production AS f
    JOIN dim.Calendar AS c ON c.DateKey = f.DateKey
    WHERE f.ActualQtyMT IS NOT NULL
    GROUP BY c.YearMonth
)
SELECT
    COALESCE(s.YearMonth, p.YearMonth) AS YearMonth,
    s.SalesMT,
    p.ProducedMT,
    p.ProducedMT - s.SalesMT AS ProducedMinusSoldMT
FROM sales AS s
FULL OUTER JOIN prod AS p ON p.YearMonth = s.YearMonth
ORDER BY YearMonth;
GO

/* 9. Inventory bridge. Must return zero rows. */
SELECT *
FROM fact.Inventory
WHERE ABS(ClosingQty - (OpeningQty + ReceiptQty - IssueQty)) > 0.001;
GO

/* 10. WRONG vs RIGHT inventory total.
   The first query adds October's closing to September's closing. That is not stock on hand.
   The second query uses the latest snapshot only. */
SELECT SUM(ClosingQty) AS Wrong_SumOfEverySnapshot
FROM fact.Inventory
WHERE StockType = N'Full' AND MaterialCode = N'LPG12';

SELECT SUM(ClosingQty) AS Right_LatestFullCylinders
FROM rpt.vw_InventoryLatest
WHERE StockType = N'Full' AND MaterialCode = N'LPG12';
GO

/* 11. Attainment the correct way: sum first, then divide. Same UoM only. */
SELECT
    p.PlantName,
    m.MaterialName,
    SUM(f.ActualQty) AS ActualQty,
    SUM(f.PlannedQty) AS PlannedQty,
    CONVERT(decimal(9, 2), 100.0 * SUM(f.ActualQty) / NULLIF(SUM(f.PlannedQty), 0)) AS AttainmentPct
FROM fact.Production AS f
JOIN dim.Plant AS p ON p.PlantCode = f.PlantCode
JOIN dim.Material AS m ON m.MaterialCode = f.MaterialCode
JOIN dim.Calendar AS c ON c.DateKey = f.DateKey
WHERE c.CalendarYear = 2026 AND c.MonthNo = 9 AND m.MaterialCode = N'LPG12'
GROUP BY p.PlantName, m.MaterialName
ORDER BY p.PlantName;
GO
