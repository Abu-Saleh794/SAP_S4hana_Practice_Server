# Orion Gas & Power — SQL Server to Power BI lab

Synthetic training data for three reports:

- A. Sales and billing
- B. Production and plant output
- C. Inventory and cylinder stock

It is not live Orion data. LPG prices and a flat 15% tax are training assumptions, not statutory VAT.

Period: 1 Jan 2026 through 31 Oct 2026. Fiscal year in `dim.Calendar` is July–June.

## Run order

1. Install [SSMS](https://learn.microsoft.com/sql/ssms/download-sql-server-management-studio-ssms) if you only installed the SQL Server engine.
2. Connect. Use the same server name later in Power BI. Typical names: `localhost`, `.\SQLEXPRESS`, or `(localdb)\MSSQLLocalDB`.
3. Open `sql/00_create_orion_training.sql` and press F5.
4. Open `sql/01_seed_sample_data.sql` and press F5.
5. The refresh returns two grids. The error grid is empty. Row counts must be:

| Object | Rows |
|---|---|
| stg.SalesBilling / fact.Sales | 260 |
| stg.ProductionOutput / fact.Production | 1,824 |
| stg.InventoryStock / fact.Inventory | 180 |
| dim.Customer | 8 |
| dim.Plant | 5 |
| dim.Material | 4 |

6. Open `sql/03_practice_queries.sql` and run one query at a time.
7. In Power BI Desktop: Get data → SQL Server → that server → database `OrionTraining` → Import.
8. Load only `dim.Calendar`, `dim.Plant`, `dim.Customer`, `dim.Material`, `fact.Sales`, `fact.Production`, `fact.Inventory`.
9. Rename them to Calendar, Plant, Customer, Material, Sales, Production, Inventory if Power BI kept the schema prefix.
10. Paste measures from `powerbi/measures.dax`.

Expected sample totals after a clean load: net revenue **815,082,499.50 BDT**, LPG **6,438.806 MT**, power **7,204,951 kWh**.

## Files

| Path | Purpose |
|---|---|
| excel/Sales_Billing.xlsx | Report A |
| excel/Production_Output.xlsx | Report B |
| excel/Inventory_Stock.xlsx | Report C |
| excel/Orion_Training_Sources.xlsx | All three sheets |
| data/*.csv | Same data, use this if Excel import asks for the ACE driver |
| sql/00_create_orion_training.sql | Database, tables, keys, views, refresh procedure |
| sql/01_seed_sample_data.sql | Load the sample without the import wizard |
| sql/02_refresh_and_checks.sql | Run after you import your own file |
| sql/03_practice_queries.sql | SQL practice |
| sql/04_bulk_insert_template.sql | Optional scripted CSV load |
| powerbi/measures.dax | Dashboard measures |

## Replace the sample with your Orion extract

1. Add every plant to `ref.Plant` and every material to `ref.Material` (`BaseUoM`, `FactorToMT`).
2. Rename your headers to the names below. Do not leave a total row or merged cells.
3. `TRUNCATE` the three `stg` tables, import the files, then `EXEC rpt.usp_RefreshFromStaging`.
4. In Power BI, Home → Refresh.

Sales columns: `BillingDoc`, `BillingItem`, `BillingDate`, `CompanyCode`, `PlantCode`, `CustomerCode`, `CustomerName`, `MaterialCode`, `MaterialName`, `ProductGroup`, `Quantity`, `UoM`, `NetAmount`, `TaxAmount`, `Currency`.

Production columns: `ProdDate`, `PlantCode`, `PlantName`, `MaterialCode`, `MaterialName`, `ProductGroup`, `ShiftCode`, `PlannedQty`, `ActualQty`, `UoM`, `DowntimeHours`.

Inventory columns: `StockDate`, `PlantCode`, `PlantName`, `MaterialCode`, `MaterialName`, `StorageLocation`, `StockType`, `OpeningQty`, `ReceiptQty`, `IssueQty`, `ClosingQty`, `UoM`.

`StockType` is `Full`, `Empty`, or `Unrestricted`. Closing must equal opening + receipt − issue.

If a stock report has only quantity on hand: set Opening = that quantity, Receipt = 0, Issue = 0, Closing = that quantity.

Master UoM must match the file. `LPG12` is `CYL` (factor 0.0125 MT). `LPG35` is `CYL` (0.035). `LPGBULK` is `MT` (1). `PWRKWH` is `KWH`.

Do not sum `ClosingQty` across dates. Do not sum quantity across CYL, MT, and KWH. Sum `QtyMT` and `QtyKWh` instead.
