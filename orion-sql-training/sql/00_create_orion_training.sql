/*
================================================================================
Orion Gas & Power — SQL Server training database
================================================================================
Run in SSMS:  File > Open > this file > Execute (F5)

Requires SQL Server 2016 or newer (SSMS recommended).

This script is re-runnable. Re-running DROPS the training tables and recreates
them empty. After every re-run, execute 01_seed_sample_data.sql again
or import your CSV files and run 02_refresh_and_checks.sql.

What you are creating
---------------------
DATABASE   OrionTraining          the container for this project
SCHEMAS    ref, stg, dim, fact, rpt
TABLES     masters, staging, dimensions, facts, error log
KEYS       primary key, unique key, foreign key
CHECKS     Severity must be Error or Warning
COMPUTED   GrossAmount, UnitPrice, AttainmentPct  (SQL calculates these)
INDEXES    support Power BI filters
PROCEDURES dim.usp_EnsureCalendar, rpt.usp_RefreshFromStaging
VIEWS      rpt.vw_MonthlySales, rpt.vw_ProductionDaily, rpt.vw_InventoryLatest

Fiscal calendar assumption: July–June (common in Bangladesh).
January 2026 is fiscal period 7 of FY2026. July 2026 is fiscal period 1 of FY2027.
================================================================================
*/

IF DB_ID(N'OrionTraining') IS NULL
    CREATE DATABASE OrionTraining;
GO

USE OrionTraining;
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'ref')
    EXEC(N'CREATE SCHEMA ref');
GO
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'stg')
    EXEC(N'CREATE SCHEMA stg');
GO
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'dim')
    EXEC(N'CREATE SCHEMA dim');
GO
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'fact')
    EXEC(N'CREATE SCHEMA fact');
GO
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'rpt')
    EXEC(N'CREATE SCHEMA rpt');
GO

/* Drop children first so the script can be run again */
DROP VIEW IF EXISTS rpt.vw_MonthlySales;
DROP VIEW IF EXISTS rpt.vw_ProductionDaily;
DROP VIEW IF EXISTS rpt.vw_InventoryLatest;
GO
DROP PROCEDURE IF EXISTS rpt.usp_RefreshFromStaging;
DROP PROCEDURE IF EXISTS dim.usp_EnsureCalendar;
GO
DROP TABLE IF EXISTS fact.Sales;
DROP TABLE IF EXISTS fact.Production;
DROP TABLE IF EXISTS fact.Inventory;
DROP TABLE IF EXISTS dim.Customer;
DROP TABLE IF EXISTS dim.Plant;
DROP TABLE IF EXISTS dim.Material;
DROP TABLE IF EXISTS dim.Calendar;
DROP TABLE IF EXISTS stg.LoadError;
DROP TABLE IF EXISTS stg.SalesBilling;
DROP TABLE IF EXISTS stg.ProductionOutput;
DROP TABLE IF EXISTS stg.InventoryStock;
DROP TABLE IF EXISTS ref.Plant;
DROP TABLE IF EXISTS ref.Material;
GO

/* ---------------------------------------------------------------------------
   MASTER DATA  (you maintain these, like SAP material master / plant)
   Excel does not own the conversion factor. SQL does.
--------------------------------------------------------------------------- */
CREATE TABLE ref.Plant (
    PlantCode     varchar(10)   NOT NULL CONSTRAINT PK_ref_Plant PRIMARY KEY,
    PlantName     nvarchar(100) NOT NULL,
    LocationName  nvarchar(100) NOT NULL,
    PlantRole     nvarchar(30)  NOT NULL,   /* Filling Plant, Depot, Power Plant */
    BusinessLine  nvarchar(20)  NOT NULL    /* LPG or Power */
);

CREATE TABLE ref.Material (
    MaterialCode  varchar(20)   NOT NULL CONSTRAINT PK_ref_Material PRIMARY KEY,
    MaterialName  nvarchar(100) NOT NULL,
    ProductGroup  nvarchar(30)  NOT NULL,   /* LPG Cylinder, LPG Bulk, Power */
    BaseUoM       varchar(10)   NOT NULL,   /* CYL, MT, KWH */
    FactorToMT    decimal(18,6) NULL        /* NULL for power. 12.5 kg cylinder = 0.0125 MT */
);
GO

INSERT INTO ref.Plant (PlantCode, PlantName, LocationName, PlantRole, BusinessLine) VALUES
(N'1000', N'Dhaka Filling Plant',      N'Dhaka',        N'Filling Plant', N'LPG'),
(N'2000', N'Chattogram Filling Plant', N'Chattogram',   N'Filling Plant', N'LPG'),
(N'3000', N'Narayanganj Depot',        N'Narayanganj',  N'Depot',         N'LPG'),
(N'4000', N'Bogura Depot',             N'Bogura',       N'Depot',         N'LPG'),
(N'5000', N'Meghna Power Plant',       N'Narayanganj',  N'Power Plant',   N'Power');

INSERT INTO ref.Material (MaterialCode, MaterialName, ProductGroup, BaseUoM, FactorToMT) VALUES
(N'LPG12',   N'LPG Cylinder 12.5 kg', N'LPG Cylinder', N'CYL', 0.012500),
(N'LPG35',   N'LPG Cylinder 35 kg',   N'LPG Cylinder', N'CYL', 0.035000),
(N'LPGBULK', N'LPG Bulk',             N'LPG Bulk',     N'MT',  1.000000),
(N'PWRKWH',  N'Electrical Energy',    N'Power',        N'KWH', NULL);
GO

/* ---------------------------------------------------------------------------
   STAGING  (landing zone — same columns as the Excel / CSV files)
   Types are loose on purpose: a bad Excel row should LOAD, then be rejected
   by the procedure into stg.LoadError. Do not point Power BI at these tables.
--------------------------------------------------------------------------- */
CREATE TABLE stg.SalesBilling (
    BillingDoc    nvarchar(20)  NULL,
    BillingItem   int           NULL,
    BillingDate   date          NULL,
    CompanyCode   nvarchar(10)  NULL,
    PlantCode     nvarchar(10)  NULL,
    CustomerCode  nvarchar(20)  NULL,
    CustomerName  nvarchar(100) NULL,
    MaterialCode  nvarchar(20)  NULL,
    MaterialName  nvarchar(100) NULL,
    ProductGroup  nvarchar(30)  NULL,
    Quantity      decimal(18,3) NULL,
    UoM           nvarchar(10)  NULL,
    NetAmount     decimal(18,2) NULL,
    TaxAmount     decimal(18,2) NULL,
    Currency      nvarchar(3)   NULL
);

CREATE TABLE stg.ProductionOutput (
    ProdDate       date          NULL,
    PlantCode      nvarchar(10)  NULL,
    PlantName      nvarchar(100) NULL,
    MaterialCode   nvarchar(20)  NULL,
    MaterialName   nvarchar(100) NULL,
    ProductGroup   nvarchar(30)  NULL,
    ShiftCode      nvarchar(10)  NULL,
    PlannedQty     decimal(18,3) NULL,
    ActualQty      decimal(18,3) NULL,
    UoM            nvarchar(10)  NULL,
    DowntimeHours  decimal(10,2) NULL
);

CREATE TABLE stg.InventoryStock (
    StockDate        date          NULL,
    PlantCode        nvarchar(10)  NULL,
    PlantName        nvarchar(100) NULL,
    MaterialCode     nvarchar(20)  NULL,
    MaterialName     nvarchar(100) NULL,
    StorageLocation  nvarchar(10)  NULL,
    StockType        nvarchar(30)  NULL,  /* Full, Empty, Unrestricted */
    OpeningQty       decimal(18,3) NULL,
    ReceiptQty       decimal(18,3) NULL,
    IssueQty         decimal(18,3) NULL,
    ClosingQty       decimal(18,3) NULL,
    UoM              nvarchar(10)  NULL
);

CREATE TABLE stg.LoadError (
    ErrorId      int IDENTITY(1,1) NOT NULL CONSTRAINT PK_LoadError PRIMARY KEY,
    SourceName   varchar(30)   NOT NULL,
    RowKey       nvarchar(200) NULL,
    Severity     varchar(10)   NOT NULL,
    ErrorMessage nvarchar(400) NOT NULL,
    LoadTime     datetime2     NOT NULL CONSTRAINT DF_LoadError_LoadTime DEFAULT (sysdatetime()),
    CONSTRAINT CK_LoadError_Severity CHECK (Severity IN ('Error', 'Warning'))
);
GO

/* ---------------------------------------------------------------------------
   DIMENSIONS  (descriptions Power BI slices by)
--------------------------------------------------------------------------- */
CREATE TABLE dim.Calendar (
    DateKey          int          NOT NULL CONSTRAINT PK_Calendar PRIMARY KEY,
    [Date]           date         NOT NULL,
    CalendarYear     smallint     NOT NULL,
    QuarterNo        tinyint      NOT NULL,
    MonthNo          tinyint      NOT NULL,
    MonthName        varchar(20)  NOT NULL,
    MonthShort       char(3)      NOT NULL,
    [Day]            tinyint      NOT NULL,
    WeekdayName      varchar(20)  NOT NULL,
    YearMonth        int          NOT NULL,
    FiscalYear       smallint     NOT NULL,
    FiscalPeriod     tinyint      NOT NULL,
    FiscalYearLabel  char(6)      NOT NULL,
    CONSTRAINT UQ_Calendar_Date UNIQUE ([Date])
);

CREATE TABLE dim.Plant (
    PlantCode     varchar(10)   NOT NULL CONSTRAINT PK_Plant PRIMARY KEY,
    PlantName     nvarchar(100) NOT NULL,
    LocationName  nvarchar(100) NOT NULL,
    PlantRole     nvarchar(30)  NOT NULL,
    BusinessLine  nvarchar(20)  NOT NULL
);

CREATE TABLE dim.Material (
    MaterialCode  varchar(20)   NOT NULL CONSTRAINT PK_Material PRIMARY KEY,
    MaterialName  nvarchar(100) NOT NULL,
    ProductGroup  nvarchar(30)  NOT NULL,
    BaseUoM       varchar(10)   NOT NULL,
    FactorToMT    decimal(18,6) NULL
);

CREATE TABLE dim.Customer (
    CustomerCode  varchar(20)   NOT NULL CONSTRAINT PK_Customer PRIMARY KEY,
    CustomerName  nvarchar(100) NOT NULL
);
GO

/* ---------------------------------------------------------------------------
   FACTS  (the numbers — one grain per table)
   Sales         one row = one billing document item          (transactions)
   Production    one row = plant + material + date + shift    (daily activity)
   Inventory     one row = plant + material + location + type + date
                 This is a SNAPSHOT. Do not sum ClosingQty across dates.
--------------------------------------------------------------------------- */
CREATE TABLE fact.Sales (
    SalesKey      int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Sales PRIMARY KEY,
    BillingDoc    nvarchar(20)  NOT NULL,
    BillingItem   int           NOT NULL,
    DateKey       int           NOT NULL,
    CompanyCode   nvarchar(10)  NOT NULL,
    PlantCode     varchar(10)   NOT NULL,
    CustomerCode  varchar(20)   NOT NULL,
    MaterialCode  varchar(20)   NOT NULL,
    Quantity      decimal(18,3) NOT NULL,
    UoM           varchar(10)   NOT NULL,
    QtyMT         decimal(18,3) NULL,     /* LPG only, converted with the master factor */
    QtyKWh        decimal(18,3) NULL,     /* Power only */
    NetAmount     decimal(18,2) NOT NULL,
    TaxAmount     decimal(18,2) NOT NULL,
    Currency      nvarchar(3)   NOT NULL,
    GrossAmount   AS (NetAmount + TaxAmount),
    UnitPrice     AS (CONVERT(decimal(18,4), NetAmount / NULLIF(Quantity, 0))),
    CONSTRAINT UQ_Sales_DocItem UNIQUE (BillingDoc, BillingItem),
    CONSTRAINT FK_Sales_Calendar FOREIGN KEY (DateKey)      REFERENCES dim.Calendar (DateKey),
    CONSTRAINT FK_Sales_Plant    FOREIGN KEY (PlantCode)    REFERENCES dim.Plant (PlantCode),
    CONSTRAINT FK_Sales_Customer FOREIGN KEY (CustomerCode) REFERENCES dim.Customer (CustomerCode),
    CONSTRAINT FK_Sales_Material FOREIGN KEY (MaterialCode) REFERENCES dim.Material (MaterialCode)
);

CREATE TABLE fact.Production (
    ProdKey        int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Production PRIMARY KEY,
    DateKey        int           NOT NULL,
    PlantCode      varchar(10)   NOT NULL,
    MaterialCode   varchar(20)   NOT NULL,
    ShiftCode      varchar(10)   NOT NULL,
    ShiftName      nvarchar(30)  NOT NULL,
    PlannedQty     decimal(18,3) NOT NULL,
    ActualQty      decimal(18,3) NOT NULL,
    UoM            varchar(10)   NOT NULL,
    DowntimeHours  decimal(10,2) NOT NULL,
    PlannedQtyMT   decimal(18,3) NULL,
    ActualQtyMT    decimal(18,3) NULL,
    PlannedKWh     decimal(18,3) NULL,
    ActualKWh      decimal(18,3) NULL,
    /* Row-level only. Do NOT average this column. Use SUM(actual)/SUM(planned). */
    AttainmentPct  AS (CONVERT(decimal(9,2), (ActualQty / NULLIF(PlannedQty, 0)) * 100)),
    CONSTRAINT UQ_Production_Grain UNIQUE (DateKey, PlantCode, MaterialCode, ShiftCode),
    CONSTRAINT FK_Production_Calendar FOREIGN KEY (DateKey)    REFERENCES dim.Calendar (DateKey),
    CONSTRAINT FK_Production_Plant    FOREIGN KEY (PlantCode)  REFERENCES dim.Plant (PlantCode),
    CONSTRAINT FK_Production_Material FOREIGN KEY (MaterialCode) REFERENCES dim.Material (MaterialCode)
);

CREATE TABLE fact.Inventory (
    InvKey           int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Inventory PRIMARY KEY,
    DateKey          int           NOT NULL,
    PlantCode        varchar(10)   NOT NULL,
    MaterialCode     varchar(20)   NOT NULL,
    StorageLocation  varchar(10)   NOT NULL,
    StockType        nvarchar(30)  NOT NULL,
    OpeningQty       decimal(18,3) NOT NULL,
    ReceiptQty       decimal(18,3) NOT NULL,
    IssueQty         decimal(18,3) NOT NULL,
    ClosingQty       decimal(18,3) NOT NULL,
    UoM              varchar(10)   NOT NULL,
    OpeningMT        decimal(18,3) NULL,
    ReceiptMT        decimal(18,3) NULL,
    IssueMT          decimal(18,3) NULL,
    ClosingMT        decimal(18,3) NULL,
    CONSTRAINT UQ_Inventory_Grain UNIQUE (DateKey, PlantCode, MaterialCode, StorageLocation, StockType),
    CONSTRAINT FK_Inventory_Calendar FOREIGN KEY (DateKey)     REFERENCES dim.Calendar (DateKey),
    CONSTRAINT FK_Inventory_Plant    FOREIGN KEY (PlantCode)   REFERENCES dim.Plant (PlantCode),
    CONSTRAINT FK_Inventory_Material FOREIGN KEY (MaterialCode) REFERENCES dim.Material (MaterialCode)
);
GO

CREATE INDEX IX_Sales_DateKey      ON fact.Sales (DateKey);
CREATE INDEX IX_Sales_Plant        ON fact.Sales (PlantCode);
CREATE INDEX IX_Sales_Customer     ON fact.Sales (CustomerCode);
CREATE INDEX IX_Sales_Material     ON fact.Sales (MaterialCode);
CREATE INDEX IX_Production_DateKey ON fact.Production (DateKey);
CREATE INDEX IX_Production_Plant   ON fact.Production (PlantCode);
CREATE INDEX IX_Inventory_DateKey  ON fact.Inventory (DateKey);
CREATE INDEX IX_Inventory_Plant    ON fact.Inventory (PlantCode);
GO

/* ---------------------------------------------------------------------------
   PROCEDURE — build any missing calendar days (language-independent names)
--------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dim.usp_EnsureCalendar
    @FromDate date,
    @ToDate   date
AS
BEGIN
    SET NOCOUNT ON;

    IF @FromDate IS NULL OR @ToDate IS NULL OR @FromDate > @ToDate
        RETURN;

    ;WITH d AS (
        SELECT @FromDate AS dt
        UNION ALL
        SELECT DATEADD(DAY, 1, dt)
        FROM d
        WHERE dt < @ToDate
    )
    INSERT INTO dim.Calendar (
        DateKey, [Date], CalendarYear, QuarterNo, MonthNo, MonthName, MonthShort,
        [Day], WeekdayName, YearMonth, FiscalYear, FiscalPeriod, FiscalYearLabel
    )
    SELECT
        CONVERT(int, CONVERT(char(8), dt, 112)),
        dt,
        YEAR(dt),
        DATEPART(QUARTER, dt),
        MONTH(dt),
        CASE MONTH(dt)
            WHEN 1 THEN 'January' WHEN 2 THEN 'February' WHEN 3 THEN 'March'
            WHEN 4 THEN 'April'   WHEN 5 THEN 'May'      WHEN 6 THEN 'June'
            WHEN 7 THEN 'July'    WHEN 8 THEN 'August'   WHEN 9 THEN 'September'
            WHEN 10 THEN 'October' WHEN 11 THEN 'November' WHEN 12 THEN 'December'
        END,
        CASE MONTH(dt)
            WHEN 1 THEN 'Jan' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar'
            WHEN 4 THEN 'Apr' WHEN 5 THEN 'May' WHEN 6 THEN 'Jun'
            WHEN 7 THEN 'Jul' WHEN 8 THEN 'Aug' WHEN 9 THEN 'Sep'
            WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Dec'
        END,
        DAY(dt),
        CASE DATEDIFF(DAY, CONVERT(date, '19000101'), dt) % 7
            WHEN 0 THEN 'Monday' WHEN 1 THEN 'Tuesday' WHEN 2 THEN 'Wednesday'
            WHEN 3 THEN 'Thursday' WHEN 4 THEN 'Friday'
            WHEN 5 THEN 'Saturday' WHEN 6 THEN 'Sunday'
        END,
        YEAR(dt) * 100 + MONTH(dt),
        CASE WHEN MONTH(dt) >= 7 THEN YEAR(dt) + 1 ELSE YEAR(dt) END,
        CASE WHEN MONTH(dt) >= 7 THEN MONTH(dt) - 6 ELSE MONTH(dt) + 6 END,
        CONCAT('FY', CASE WHEN MONTH(dt) >= 7 THEN YEAR(dt) + 1 ELSE YEAR(dt) END)
    FROM d
    WHERE NOT EXISTS (
        SELECT 1 FROM dim.Calendar c WHERE c.[Date] = d.dt
    )
    OPTION (MAXRECURSION 32767);
END
GO

/* ---------------------------------------------------------------------------
   PROCEDURE — validate staging, rebuild dims from masters, reload facts
   Safe to run every time you import a new Excel extract.
--------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE rpt.usp_RefreshFromStaging
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        TRUNCATE TABLE stg.LoadError;

        /* Cleaned copies. RowKey is how a staging row is identified in the log. */
        IF OBJECT_ID('tempdb..#Sales') IS NOT NULL DROP TABLE #Sales;
        IF OBJECT_ID('tempdb..#Prod')  IS NOT NULL DROP TABLE #Prod;
        IF OBJECT_ID('tempdb..#Inv')   IS NOT NULL DROP TABLE #Inv;

        SELECT
            CONCAT(NULLIF(LTRIM(RTRIM(BillingDoc)), N''), N'-', CONVERT(varchar(20), BillingItem)) AS RowKey,
            NULLIF(LTRIM(RTRIM(BillingDoc)), N'')   AS BillingDoc,
            BillingItem,
            BillingDate,
            NULLIF(LTRIM(RTRIM(CompanyCode)), N'')  AS CompanyCode,
            NULLIF(LTRIM(RTRIM(PlantCode)), N'')    AS PlantCode,
            NULLIF(LTRIM(RTRIM(CustomerCode)), N'') AS CustomerCode,
            NULLIF(LTRIM(RTRIM(CustomerName)), N'') AS CustomerName,
            NULLIF(LTRIM(RTRIM(MaterialCode)), N'') AS MaterialCode,
            Quantity,
            NULLIF(LTRIM(RTRIM(UoM)), N'')          AS UoM,
            NetAmount,
            TaxAmount,
            NULLIF(UPPER(LTRIM(RTRIM(Currency))), N'') AS Currency
        INTO #Sales
        FROM stg.SalesBilling;

        SELECT
            CONCAT(
                ISNULL(NULLIF(LTRIM(RTRIM(PlantCode)), N''), N'?'), N'|',
                ISNULL(CONVERT(char(10), ProdDate, 23), N'?'), N'|',
                ISNULL(NULLIF(LTRIM(RTRIM(MaterialCode)), N''), N'?'), N'|',
                ISNULL(NULLIF(LTRIM(RTRIM(ShiftCode)), N''), N'?')
            ) AS RowKey,
            ProdDate,
            NULLIF(LTRIM(RTRIM(PlantCode)), N'')    AS PlantCode,
            NULLIF(LTRIM(RTRIM(PlantName)), N'')    AS PlantName,
            NULLIF(LTRIM(RTRIM(MaterialCode)), N'') AS MaterialCode,
            NULLIF(LTRIM(RTRIM(ShiftCode)), N'')    AS ShiftCode,
            PlannedQty,
            ActualQty,
            NULLIF(LTRIM(RTRIM(UoM)), N'')          AS UoM,
            DowntimeHours
        INTO #Prod
        FROM stg.ProductionOutput;

        SELECT
            CONCAT(
                ISNULL(NULLIF(LTRIM(RTRIM(PlantCode)), N''), N'?'), N'|',
                ISNULL(CONVERT(char(10), StockDate, 23), N'?'), N'|',
                ISNULL(NULLIF(LTRIM(RTRIM(MaterialCode)), N''), N'?'), N'|',
                ISNULL(NULLIF(LTRIM(RTRIM(StorageLocation)), N''), N'?'), N'|',
                ISNULL(NULLIF(LTRIM(RTRIM(StockType)), N''), N'?')
            ) AS RowKey,
            StockDate,
            NULLIF(LTRIM(RTRIM(PlantCode)), N'')        AS PlantCode,
            NULLIF(LTRIM(RTRIM(MaterialCode)), N'')     AS MaterialCode,
            NULLIF(LTRIM(RTRIM(StorageLocation)), N'')  AS StorageLocation,
            NULLIF(LTRIM(RTRIM(StockType)), N'')        AS StockType,
            OpeningQty, ReceiptQty, IssueQty, ClosingQty,
            NULLIF(LTRIM(RTRIM(UoM)), N'')              AS UoM
        INTO #Inv
        FROM stg.InventoryStock;

        /* ---- Sales rules ---- */
        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Sales', RowKey, N'Error', N'Billing document or item is missing'
        FROM #Sales WHERE BillingDoc IS NULL OR BillingItem IS NULL;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Sales', RowKey, N'Error', N'Billing date is missing'
        FROM #Sales WHERE BillingDate IS NULL;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Sales', RowKey, N'Error', N'Customer code is missing'
        FROM #Sales WHERE CustomerCode IS NULL;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Sales', RowKey, N'Error', N'Company code is missing'
        FROM #Sales WHERE CompanyCode IS NULL;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Sales', s.RowKey, N'Error', N'Plant code is missing'
        FROM #Sales s WHERE s.PlantCode IS NULL;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Sales', s.RowKey, N'Error',
               CONCAT(N'Unknown plant [', s.PlantCode, N']. Add it to ref.Plant, then refresh.')
        FROM #Sales s
        LEFT JOIN ref.Plant p ON p.PlantCode = s.PlantCode
        WHERE s.PlantCode IS NOT NULL AND p.PlantCode IS NULL;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Sales', s.RowKey, N'Error', N'Material code is missing'
        FROM #Sales s WHERE s.MaterialCode IS NULL;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Sales', s.RowKey, N'Error',
               CONCAT(N'Unknown material [', s.MaterialCode, N']. Add it to ref.Material, then refresh.')
        FROM #Sales s
        LEFT JOIN ref.Material m ON m.MaterialCode = s.MaterialCode
        WHERE s.MaterialCode IS NOT NULL AND m.MaterialCode IS NULL;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Sales', s.RowKey, N'Error',
               CONCAT(N'UoM [', ISNULL(s.UoM, N'(blank)'), N'] does not match material master [', m.BaseUoM,
                      N']. Fix the file or change BaseUoM and FactorToMT together.')
        FROM #Sales s
        JOIN ref.Material m ON m.MaterialCode = s.MaterialCode
        WHERE s.UoM IS NULL OR UPPER(s.UoM) <> UPPER(m.BaseUoM);

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Sales', RowKey, N'Error', N'Quantity must be greater than zero'
        FROM #Sales WHERE Quantity IS NULL OR Quantity <= 0;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Sales', RowKey, N'Error', N'Net amount is missing or negative'
        FROM #Sales WHERE NetAmount IS NULL OR NetAmount < 0;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Sales', RowKey, N'Error', N'Tax amount is missing or negative'
        FROM #Sales WHERE TaxAmount IS NULL OR TaxAmount < 0;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Sales', RowKey, N'Error', N'Duplicate billing document item'
        FROM #Sales
        WHERE BillingDoc IS NOT NULL AND BillingItem IS NOT NULL
        GROUP BY RowKey
        HAVING COUNT(*) > 1;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Sales', RowKey, N'Warning',
               CONCAT(N'Currency is ', Currency, N', not BDT. The dashboard sums amounts. Do not mix currencies.')
        FROM #Sales
        WHERE Currency IS NOT NULL AND Currency <> N'BDT';

        /* ---- Production rules ---- */
        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Production', RowKey, N'Error', N'Production date is missing' FROM #Prod WHERE ProdDate IS NULL;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Production', RowKey, N'Error', N'Plant code is missing' FROM #Prod WHERE PlantCode IS NULL;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Production', s.RowKey, N'Error',
               CONCAT(N'Unknown plant [', s.PlantCode, N']. Add it to ref.Plant, then refresh.')
        FROM #Prod s
        LEFT JOIN ref.Plant p ON p.PlantCode = s.PlantCode
        WHERE s.PlantCode IS NOT NULL AND p.PlantCode IS NULL;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Production', s.RowKey, N'Error', N'Material code is missing' FROM #Prod s WHERE s.MaterialCode IS NULL;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Production', s.RowKey, N'Error',
               CONCAT(N'Unknown material [', s.MaterialCode, N']. Add it to ref.Material, then refresh.')
        FROM #Prod s
        LEFT JOIN ref.Material m ON m.MaterialCode = s.MaterialCode
        WHERE s.MaterialCode IS NOT NULL AND m.MaterialCode IS NULL;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Production', s.RowKey, N'Error',
               CONCAT(N'UoM [', ISNULL(s.UoM, N'(blank)'), N'] does not match material master [', m.BaseUoM, N'].')
        FROM #Prod s
        JOIN ref.Material m ON m.MaterialCode = s.MaterialCode
        WHERE s.UoM IS NULL OR UPPER(s.UoM) <> UPPER(m.BaseUoM);

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Production', RowKey, N'Error', N'Planned or actual quantity is missing or negative'
        FROM #Prod WHERE PlannedQty IS NULL OR ActualQty IS NULL OR PlannedQty < 0 OR ActualQty < 0;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Production', RowKey, N'Error', N'Downtime hours are missing or negative'
        FROM #Prod WHERE DowntimeHours IS NULL OR DowntimeHours < 0;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Production', RowKey, N'Error', N'Duplicate plant / date / material / shift'
        FROM #Prod
        GROUP BY RowKey
        HAVING COUNT(*) > 1;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Production', s.RowKey, N'Warning',
               CONCAT(N'File plant name differs from master [', p.PlantName, N']. Master name is used.')
        FROM #Prod s
        JOIN ref.Plant p ON p.PlantCode = s.PlantCode
        WHERE s.PlantName IS NOT NULL AND s.PlantName <> p.PlantName;

        /* ---- Inventory rules ---- */
        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Inventory', RowKey, N'Error', N'Stock date is missing' FROM #Inv WHERE StockDate IS NULL;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Inventory', RowKey, N'Error', N'Plant code is missing' FROM #Inv WHERE PlantCode IS NULL;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Inventory', s.RowKey, N'Error',
               CONCAT(N'Unknown plant [', s.PlantCode, N']. Add it to ref.Plant, then refresh.')
        FROM #Inv s
        LEFT JOIN ref.Plant p ON p.PlantCode = s.PlantCode
        WHERE s.PlantCode IS NOT NULL AND p.PlantCode IS NULL;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Inventory', s.RowKey, N'Error', N'Material code is missing' FROM #Inv s WHERE s.MaterialCode IS NULL;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Inventory', s.RowKey, N'Error',
               CONCAT(N'Unknown material [', s.MaterialCode, N']. Add it to ref.Material, then refresh.')
        FROM #Inv s
        LEFT JOIN ref.Material m ON m.MaterialCode = s.MaterialCode
        WHERE s.MaterialCode IS NOT NULL AND m.MaterialCode IS NULL;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Inventory', RowKey, N'Error', N'Storage location or stock type is missing'
        FROM #Inv WHERE StorageLocation IS NULL OR StockType IS NULL;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Inventory', s.RowKey, N'Error',
               CONCAT(N'UoM [', ISNULL(s.UoM, N'(blank)'), N'] does not match material master [', m.BaseUoM, N'].')
        FROM #Inv s
        JOIN ref.Material m ON m.MaterialCode = s.MaterialCode
        WHERE s.UoM IS NULL OR UPPER(s.UoM) <> UPPER(m.BaseUoM);

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Inventory', RowKey, N'Error', N'A quantity is missing or negative'
        FROM #Inv
        WHERE OpeningQty IS NULL OR ReceiptQty IS NULL OR IssueQty IS NULL OR ClosingQty IS NULL
           OR OpeningQty < 0 OR ReceiptQty < 0 OR IssueQty < 0 OR ClosingQty < 0;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Inventory', RowKey, N'Error',
               N'ClosingQty must equal OpeningQty + ReceiptQty - IssueQty. Fix the Excel row.'
        FROM #Inv
        WHERE OpeningQty IS NOT NULL AND ReceiptQty IS NOT NULL AND IssueQty IS NOT NULL AND ClosingQty IS NOT NULL
          AND ABS(ClosingQty - (OpeningQty + ReceiptQty - IssueQty)) > 0.001;

        INSERT INTO stg.LoadError (SourceName, RowKey, Severity, ErrorMessage)
        SELECT N'Inventory', RowKey, N'Error', N'Duplicate plant / date / material / location / stock type'
        FROM #Inv
        GROUP BY RowKey
        HAVING COUNT(*) > 1;

        /* Calendar must contain every date we are about to load */
        DECLARE @min date, @max date;
        SELECT @min = MIN(d), @max = MAX(d)
        FROM (
            SELECT BillingDate AS d FROM #Sales WHERE BillingDate IS NOT NULL
            UNION ALL
            SELECT ProdDate FROM #Prod WHERE ProdDate IS NOT NULL
            UNION ALL
            SELECT StockDate FROM #Inv WHERE StockDate IS NOT NULL
        ) x;

        EXEC dim.usp_EnsureCalendar @min, @max;

        /* Facts first (they hold the foreign keys), then rebuild dimensions */
        DELETE FROM fact.Sales;
        DELETE FROM fact.Production;
        DELETE FROM fact.Inventory;
        DELETE FROM dim.Customer;
        DELETE FROM dim.Plant;
        DELETE FROM dim.Material;

        INSERT INTO dim.Plant (PlantCode, PlantName, LocationName, PlantRole, BusinessLine)
        SELECT PlantCode, PlantName, LocationName, PlantRole, BusinessLine
        FROM ref.Plant;

        INSERT INTO dim.Material (MaterialCode, MaterialName, ProductGroup, BaseUoM, FactorToMT)
        SELECT MaterialCode, MaterialName, ProductGroup, BaseUoM, FactorToMT
        FROM ref.Material;

        INSERT INTO dim.Customer (CustomerCode, CustomerName)
        SELECT s.CustomerCode,
               COALESCE(MAX(s.CustomerName), s.CustomerCode)
        FROM #Sales s
        WHERE s.CustomerCode IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM stg.LoadError e
              WHERE e.SourceName = N'Sales' AND e.Severity = N'Error' AND e.RowKey = s.RowKey
          )
        GROUP BY s.CustomerCode;

        INSERT INTO fact.Sales (
            BillingDoc, BillingItem, DateKey, CompanyCode, PlantCode, CustomerCode, MaterialCode,
            Quantity, UoM, QtyMT, QtyKWh, NetAmount, TaxAmount, Currency
        )
        SELECT
            s.BillingDoc,
            s.BillingItem,
            CONVERT(int, CONVERT(char(8), s.BillingDate, 112)),
            s.CompanyCode,
            s.PlantCode,
            s.CustomerCode,
            s.MaterialCode,
            s.Quantity,
            m.BaseUoM,
            CASE WHEN m.ProductGroup = N'Power' THEN NULL ELSE ROUND(s.Quantity * m.FactorToMT, 3) END,
            CASE WHEN m.ProductGroup = N'Power' THEN s.Quantity ELSE NULL END,
            s.NetAmount,
            s.TaxAmount,
            s.Currency
        FROM #Sales s
        JOIN dim.Material m ON m.MaterialCode = s.MaterialCode
        WHERE NOT EXISTS (
            SELECT 1 FROM stg.LoadError e
            WHERE e.SourceName = N'Sales' AND e.Severity = N'Error' AND e.RowKey = s.RowKey
        );

        INSERT INTO fact.Production (
            DateKey, PlantCode, MaterialCode, ShiftCode, ShiftName,
            PlannedQty, ActualQty, UoM, DowntimeHours,
            PlannedQtyMT, ActualQtyMT, PlannedKWh, ActualKWh
        )
        SELECT
            CONVERT(int, CONVERT(char(8), s.ProdDate, 112)),
            s.PlantCode,
            s.MaterialCode,
            s.ShiftCode,
            CASE s.ShiftCode
                WHEN N'A' THEN N'Shift A'
                WHEN N'B' THEN N'Shift B'
                WHEN N'C' THEN N'Shift C'
                WHEN N'G' THEN N'Generation'
                ELSE N'Unknown shift'
            END,
            s.PlannedQty,
            s.ActualQty,
            m.BaseUoM,
            s.DowntimeHours,
            CASE WHEN m.ProductGroup = N'Power' THEN NULL ELSE ROUND(s.PlannedQty * m.FactorToMT, 3) END,
            CASE WHEN m.ProductGroup = N'Power' THEN NULL ELSE ROUND(s.ActualQty * m.FactorToMT, 3) END,
            CASE WHEN m.ProductGroup = N'Power' THEN s.PlannedQty ELSE NULL END,
            CASE WHEN m.ProductGroup = N'Power' THEN s.ActualQty ELSE NULL END
        FROM #Prod s
        JOIN dim.Material m ON m.MaterialCode = s.MaterialCode
        WHERE NOT EXISTS (
            SELECT 1 FROM stg.LoadError e
            WHERE e.SourceName = N'Production' AND e.Severity = N'Error' AND e.RowKey = s.RowKey
        );

        INSERT INTO fact.Inventory (
            DateKey, PlantCode, MaterialCode, StorageLocation, StockType,
            OpeningQty, ReceiptQty, IssueQty, ClosingQty, UoM,
            OpeningMT, ReceiptMT, IssueMT, ClosingMT
        )
        SELECT
            CONVERT(int, CONVERT(char(8), s.StockDate, 112)),
            s.PlantCode,
            s.MaterialCode,
            s.StorageLocation,
            s.StockType,
            s.OpeningQty, s.ReceiptQty, s.IssueQty, s.ClosingQty,
            m.BaseUoM,
            ROUND(s.OpeningQty * m.FactorToMT, 3),
            ROUND(s.ReceiptQty * m.FactorToMT, 3),
            ROUND(s.IssueQty   * m.FactorToMT, 3),
            ROUND(s.ClosingQty * m.FactorToMT, 3)
        FROM #Inv s
        JOIN dim.Material m ON m.MaterialCode = s.MaterialCode
        WHERE NOT EXISTS (
            SELECT 1 FROM stg.LoadError e
            WHERE e.SourceName = N'Inventory' AND e.Severity = N'Error' AND e.RowKey = s.RowKey
        );

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    /* Result 1 — problems found in the files. Empty = clean load. */
    SELECT SourceName, Severity, ErrorMessage, COUNT(*) AS AffectedRows
    FROM stg.LoadError
    GROUP BY SourceName, Severity, ErrorMessage
    ORDER BY Severity, SourceName, ErrorMessage;

    /* Result 2 — what Power BI will see */
    SELECT ObjectName, [Rows]
    FROM (
        SELECT 1 AS SortKey, 'stg.SalesBilling' AS ObjectName, COUNT(*) AS [Rows] FROM stg.SalesBilling
        UNION ALL SELECT 2, 'stg.ProductionOutput', COUNT(*) FROM stg.ProductionOutput
        UNION ALL SELECT 3, 'stg.InventoryStock', COUNT(*) FROM stg.InventoryStock
        UNION ALL SELECT 4, 'fact.Sales', COUNT(*) FROM fact.Sales
        UNION ALL SELECT 5, 'fact.Production', COUNT(*) FROM fact.Production
        UNION ALL SELECT 6, 'fact.Inventory', COUNT(*) FROM fact.Inventory
        UNION ALL SELECT 7, 'dim.Customer', COUNT(*) FROM dim.Customer
        UNION ALL SELECT 8, 'dim.Plant', COUNT(*) FROM dim.Plant
        UNION ALL SELECT 9, 'dim.Material', COUNT(*) FROM dim.Material
        UNION ALL SELECT 10, 'dim.Calendar', COUNT(*) FROM dim.Calendar
        UNION ALL SELECT 11, 'stg.LoadError', COUNT(*) FROM stg.LoadError
    ) c
    ORDER BY SortKey;
END
GO

CREATE OR ALTER VIEW rpt.vw_MonthlySales
AS
SELECT
    c.CalendarYear,
    c.MonthNo,
    c.MonthName,
    c.YearMonth,
    c.FiscalYearLabel,
    c.FiscalPeriod,
    p.PlantCode,
    p.PlantName,
    p.PlantRole,
    cu.CustomerCode,
    cu.CustomerName,
    m.MaterialCode,
    m.MaterialName,
    m.ProductGroup,
    SUM(f.Quantity)   AS Quantity,
    MAX(f.UoM)        AS UoM,
    SUM(f.QtyMT)      AS QtyMT,
    SUM(f.QtyKWh)     AS QtyKWh,
    SUM(f.NetAmount)  AS NetAmount,
    SUM(f.TaxAmount)  AS TaxAmount,
    SUM(f.GrossAmount) AS GrossAmount
FROM fact.Sales AS f
JOIN dim.Calendar AS c  ON c.DateKey = f.DateKey
JOIN dim.Plant    AS p  ON p.PlantCode = f.PlantCode
JOIN dim.Customer AS cu ON cu.CustomerCode = f.CustomerCode
JOIN dim.Material AS m  ON m.MaterialCode = f.MaterialCode
GROUP BY
    c.CalendarYear, c.MonthNo, c.MonthName, c.YearMonth, c.FiscalYearLabel, c.FiscalPeriod,
    p.PlantCode, p.PlantName, p.PlantRole,
    cu.CustomerCode, cu.CustomerName,
    m.MaterialCode, m.MaterialName, m.ProductGroup;
GO

CREATE OR ALTER VIEW rpt.vw_ProductionDaily
AS
SELECT
    c.[Date],
    c.CalendarYear,
    c.MonthNo,
    c.MonthName,
    c.YearMonth,
    p.PlantCode,
    p.PlantName,
    p.PlantRole,
    m.MaterialCode,
    m.MaterialName,
    m.ProductGroup,
    f.ShiftCode,
    f.ShiftName,
    f.PlannedQty,
    f.ActualQty,
    f.UoM,
    f.ActualQty - f.PlannedQty AS QtyVariance,
    f.AttainmentPct,
    f.DowntimeHours,
    f.PlannedQtyMT,
    f.ActualQtyMT,
    f.PlannedKWh,
    f.ActualKWh
FROM fact.Production AS f
JOIN dim.Calendar AS c ON c.DateKey = f.DateKey
JOIN dim.Plant    AS p ON p.PlantCode = f.PlantCode
JOIN dim.Material AS m ON m.MaterialCode = f.MaterialCode;
GO

/* Latest snapshot only. Safe to sum ClosingQty from THIS view. */
CREATE OR ALTER VIEW rpt.vw_InventoryLatest
AS
WITH ranked AS (
    SELECT
        c.[Date] AS StockDate,
        p.PlantCode,
        p.PlantName,
        m.MaterialCode,
        m.MaterialName,
        m.ProductGroup,
        f.StorageLocation,
        f.StockType,
        f.OpeningQty,
        f.ReceiptQty,
        f.IssueQty,
        f.ClosingQty,
        f.UoM,
        f.ClosingMT,
        ROW_NUMBER() OVER (
            PARTITION BY f.PlantCode, f.MaterialCode, f.StorageLocation, f.StockType
            ORDER BY c.[Date] DESC
        ) AS rn
    FROM fact.Inventory AS f
    JOIN dim.Calendar AS c ON c.DateKey = f.DateKey
    JOIN dim.Plant    AS p ON p.PlantCode = f.PlantCode
    JOIN dim.Material AS m ON m.MaterialCode = f.MaterialCode
)
SELECT
    StockDate, PlantCode, PlantName, MaterialCode, MaterialName, ProductGroup,
    StorageLocation, StockType, OpeningQty, ReceiptQty, IssueQty, ClosingQty, UoM, ClosingMT
FROM ranked
WHERE rn = 1;
GO

EXEC dim.usp_EnsureCalendar '20260101', '20261231';
GO

SELECT s.name AS SchemaName, o.name AS ObjectName, o.type_desc
FROM sys.objects AS o
JOIN sys.schemas AS s ON s.schema_id = o.schema_id
WHERE s.name IN (N'ref', N'stg', N'dim', N'fact', N'rpt')
  AND o.type IN ('U', 'V', 'P')
ORDER BY s.name, o.type_desc, o.name;
GO
