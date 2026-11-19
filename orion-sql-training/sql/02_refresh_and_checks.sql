/*
Run this AFTER you import your own CSV / Excel into the staging tables.
It keeps valid rows, logs bad rows, and rebuilds the tables Power BI reads.
*/
USE OrionTraining;
GO

EXEC rpt.usp_RefreshFromStaging;
GO

/* Business check — top customers. */
SELECT TOP (8)
    cu.CustomerCode,
    cu.CustomerName,
    SUM(f.NetAmount) AS NetAmountBDT,
    SUM(f.QtyMT)     AS LpgMT,
    SUM(f.QtyKWh)    AS PowerKWh
FROM fact.Sales AS f
JOIN dim.Customer AS cu ON cu.CustomerCode = f.CustomerCode
GROUP BY cu.CustomerCode, cu.CustomerName
ORDER BY SUM(f.NetAmount) DESC;
GO

/* Depots must show zero production rows. Filling plants and power must not. */
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

/* Snapshot test: this number is only meaningful because the view keeps the latest date. */
SELECT PlantName, MaterialName, StockType, ClosingQty, UoM
FROM rpt.vw_InventoryLatest
ORDER BY PlantName, MaterialName, StockType;
GO
