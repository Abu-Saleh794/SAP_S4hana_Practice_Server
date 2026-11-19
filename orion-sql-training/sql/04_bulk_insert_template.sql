/*
BULK INSERT is the script version of "load the CSV".
Prefer the SSMS Import Wizard while you are learning (see the lab guide).
Use this only when:
  - the CSV is on the same machine as the SQL Server service
  - the SQL Server service account can read the folder
  - you are on SQL Server 2017 or newer (FORMAT = 'CSV')

Edit the three paths, then run this file.
*/
USE OrionTraining;
GO

TRUNCATE TABLE stg.SalesBilling;
TRUNCATE TABLE stg.ProductionOutput;
TRUNCATE TABLE stg.InventoryStock;
GO

BULK INSERT stg.SalesBilling
FROM 'C:\OrionTraining\Sales_Billing.csv'
WITH (
    FORMAT = 'CSV',
    FIRSTROW = 2,
    CODEPAGE = '65001',
    TABLOCK
);
GO

BULK INSERT stg.ProductionOutput
FROM 'C:\OrionTraining\Production_Output.csv'
WITH (
    FORMAT = 'CSV',
    FIRSTROW = 2,
    CODEPAGE = '65001',
    TABLOCK
);
GO

BULK INSERT stg.InventoryStock
FROM 'C:\OrionTraining\Inventory_Stock.csv'
WITH (
    FORMAT = 'CSV',
    FIRSTROW = 2,
    CODEPAGE = '65001',
    TABLOCK
);
GO

EXEC rpt.usp_RefreshFromStaging;
GO
