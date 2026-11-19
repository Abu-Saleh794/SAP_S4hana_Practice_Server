#!/usr/bin/env python3
"""Create the Orion training Excel files, CSVs, and SQL seed. Synthetic data only."""

import csv
import math
import random
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
EXCEL = ROOT / "excel"
SQL = ROOT / "sql"

PLANTS = {
    "1000": "Dhaka Filling Plant",
    "2000": "Chattogram Filling Plant",
    "3000": "Narayanganj Depot",
    "4000": "Bogura Depot",
    "5000": "Meghna Power Plant",
}

MATERIALS = {
    "LPG12": ("LPG Cylinder 12.5 kg", "LPG Cylinder", "CYL"),
    "LPG35": ("LPG Cylinder 35 kg", "LPG Cylinder", "CYL"),
    "LPGBULK": ("LPG Bulk", "LPG Bulk", "MT"),
    "PWRKWH": ("Electrical Energy", "Power", "KWH"),
}

PRICES = {
    "LPG12": Decimal("1550"),
    "LPG35": Decimal("4300"),
    "LPGBULK": Decimal("105000"),
    "PWRKWH": Decimal("9.50"),
}

# Customer, name, list of (material, plant, qty per invoice)
CUSTOMERS = [
    ("C1001", "City Retail Network", [("LPG12", "1000", 4200), ("LPG35", "1000", 650)]),
    ("C1002", "Northern Distributors", [("LPG12", "4000", 2400), ("LPG35", "4000", 380)]),
    ("C1005", "Sylhet City Gas Dealers", [("LPG12", "3000", 1900), ("LPG35", "3000", 260)]),
    ("C1008", "Rural Dealer Cooperative", [("LPG12", "4000", 1600), ("LPG35", "4000", 210)]),
    ("C1007", "Hotel and Commercial", [("LPG12", "1000", 420)]),
    ("C1003", "Port Bulk Industries", [("LPGBULK", "2000", 85)]),
    ("C1004", "Meghna Textile", [("LPGBULK", "2000", 48), ("LPG35", "2000", 120)]),
    ("C1006", "Orion Power Offtake", [("PWRKWH", "5000", 360000)]),
]

PRODUCTION = [
    ("1000", "LPG12", "A", 2800),
    ("1000", "LPG35", "A", 450),
    ("2000", "LPG12", "A", 1600),
    ("2000", "LPG35", "A", 700),
    ("2000", "LPGBULK", "A", 15),
    ("5000", "PWRKWH", "G", 32000),
]

# (plant, material, stock type, location, opening, monthly receipt base)
INVENTORY_SERIES = [
    ("1000", "LPG12", "Full", "FG01", 9000, 10000),
    ("2000", "LPG12", "Full", "FG01", 7000, 14000),
    ("3000", "LPG12", "Full", "FG01", 2800, 4200),
    ("4000", "LPG12", "Full", "FG01", 5200, 8200),
    ("1000", "LPG12", "Empty", "EMT1", 3200, 9000),
    ("2000", "LPG12", "Empty", "EMT1", 2500, 12000),
    ("3000", "LPG12", "Empty", "EMT1", 1100, 3800),
    ("4000", "LPG12", "Empty", "EMT1", 2000, 7500),
    ("1000", "LPG35", "Full", "FG01", 1600, 1800),
    ("2000", "LPG35", "Full", "FG01", 1400, 2200),
    ("3000", "LPG35", "Full", "FG01", 500, 700),
    ("4000", "LPG35", "Full", "FG01", 900, 1400),
    ("1000", "LPG35", "Empty", "EMT1", 600, 1600),
    ("2000", "LPG35", "Empty", "EMT1", 500, 1800),
    ("3000", "LPG35", "Empty", "EMT1", 200, 600),
    ("4000", "LPG35", "Empty", "EMT1", 350, 1100),
    ("1000", "LPGBULK", "Unrestricted", "TANK", Decimal("80"), Decimal("30")),
    ("2000", "LPGBULK", "Unrestricted", "TANK", Decimal("420"), Decimal("280")),
]

SALES_HEADER = [
    "BillingDoc", "BillingItem", "BillingDate", "CompanyCode", "PlantCode",
    "CustomerCode", "CustomerName", "MaterialCode", "MaterialName", "ProductGroup",
    "Quantity", "UoM", "NetAmount", "TaxAmount", "Currency",
]
PROD_HEADER = [
    "ProdDate", "PlantCode", "PlantName", "MaterialCode", "MaterialName",
    "ProductGroup", "ShiftCode", "PlannedQty", "ActualQty", "UoM", "DowntimeHours",
]
INV_HEADER = [
    "StockDate", "PlantCode", "PlantName", "MaterialCode", "MaterialName",
    "StorageLocation", "StockType", "OpeningQty", "ReceiptQty", "IssueQty",
    "ClosingQty", "UoM",
]


def q2(value):
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def q3(value):
    return Decimal(value).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def month_end(year, month):
    return date(year, month, monthrange(year, month)[1])


def build_sales(rng):
    rows = []
    doc_no = 1
    for month in range(1, 11):
        season = Decimal(str(1 + 0.06 * math.sin((month - 1) / 12 * 2 * math.pi)))
        for code, name, lines in CUSTOMERS:
            for day in (8, 22):
                billing_doc = f"9026{doc_no:06d}"
                doc_no += 1
                item = 10
                for material, plant, base_qty in lines:
                    jitter = Decimal(str(0.94 + rng.random() * 0.12))
                    raw_qty = Decimal(base_qty) * season * jitter
                    uom = MATERIALS[material][2]
                    if uom in ("CYL", "KWH"):
                        qty = Decimal(int(raw_qty.quantize(Decimal("1"), rounding=ROUND_HALF_UP)))
                    else:
                        qty = q3(raw_qty)
                    net = q2(qty * PRICES[material])
                    tax = q2(net * Decimal("0.15"))
                    mat_name, group, uom = MATERIALS[material]
                    rows.append({
                        "BillingDoc": billing_doc,
                        "BillingItem": item,
                        "BillingDate": date(2026, month, day),
                        "CompanyCode": "OG01",
                        "PlantCode": plant,
                        "CustomerCode": code,
                        "CustomerName": name,
                        "MaterialCode": material,
                        "MaterialName": mat_name,
                        "ProductGroup": group,
                        "Quantity": qty,
                        "UoM": uom,
                        "NetAmount": net,
                        "TaxAmount": tax,
                        "Currency": "BDT",
                    })
                    item += 10
    return rows


def build_production(rng):
    rows = []
    current = date(2026, 1, 1)
    end = date(2026, 10, 31)
    while current <= end:
        wave = 1 + 0.05 * math.sin(current.toordinal() / 6)
        for plant, material, shift, base in PRODUCTION:
            planned_raw = base * wave
            attain = 0.92 + rng.random() * 0.12
            downtime = round(rng.random() * 2.2, 2)
            if downtime > 1.2:
                attain -= 0.05
            attain = min(1.08, max(0.78, attain))
            uom = MATERIALS[material][2]
            if uom in ("CYL", "KWH"):
                planned = Decimal(int(round(planned_raw)))
                actual = Decimal(int(round(float(planned) * attain)))
            else:
                planned = q3(planned_raw)
                actual = q3(Decimal(str(float(planned) * attain)))
            mat_name, group, uom = MATERIALS[material]
            rows.append({
                "ProdDate": current,
                "PlantCode": plant,
                "PlantName": PLANTS[plant],
                "MaterialCode": material,
                "MaterialName": mat_name,
                "ProductGroup": group,
                "ShiftCode": shift,
                "PlannedQty": planned,
                "ActualQty": actual,
                "UoM": uom,
                "DowntimeHours": Decimal(str(downtime)),
            })
        current += timedelta(days=1)
    return rows


def build_inventory(rng):
    rows = []
    openings = {}
    for plant, material, stock_type, location, opening, _receipt in INVENTORY_SERIES:
        openings[(plant, material, stock_type, location)] = opening

    for month in range(1, 11):
        stock_date = month_end(2026, month)
        for plant, material, stock_type, location, _opening, base_receipt in INVENTORY_SERIES:
            key = (plant, material, stock_type, location)
            opening = openings[key]
            mat_name, _group, uom = MATERIALS[material]
            if uom == "MT":
                opening = Decimal(opening)
                jitter = Decimal(str(0.92 + rng.random() * 0.16))
                receipt = q3(Decimal(base_receipt) * jitter)
                delta = q3(opening * Decimal(str(rng.uniform(-0.04, 0.04))))
                issue = receipt - delta
                if issue < 0:
                    issue = Decimal("0.000")
                closing = q3(opening + receipt - issue)
                opening_out, receipt_out, issue_out, closing_out = opening, receipt, issue, closing
            else:
                opening = int(opening)
                jitter = 0.92 + rng.random() * 0.16
                receipt = int(round(base_receipt * jitter))
                delta = int(round(opening * (rng.uniform(-0.04, 0.04))))
                issue = receipt - delta
                if issue < 0:
                    issue = 0
                closing = opening + receipt - issue
                opening_out, receipt_out, issue_out, closing_out = opening, receipt, issue, closing
            if Decimal(closing_out) < 0:
                raise SystemExit(f"Negative stock at {key} {stock_date}")
            rows.append({
                "StockDate": stock_date,
                "PlantCode": plant,
                "PlantName": PLANTS[plant],
                "MaterialCode": material,
                "MaterialName": mat_name,
                "StorageLocation": location,
                "StockType": stock_type,
                "OpeningQty": opening_out,
                "ReceiptQty": receipt_out,
                "IssueQty": issue_out,
                "ClosingQty": closing_out,
                "UoM": uom,
            })
            openings[key] = closing_out
    return rows


def write_csv(path, header, rows):
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=header, lineterminator="\n")
        writer.writeheader()
        for row in rows:
            out = {}
            for key in header:
                value = row[key]
                if isinstance(value, date):
                    out[key] = value.isoformat()
                elif isinstance(value, Decimal):
                    out[key] = format(value, "f")
                else:
                    out[key] = value
            writer.writerow(out)


def write_xlsx(path, sheets):
    """sheets: list of (title, header, rows, readme_lines or None)"""
    book = Workbook()
    first = True
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="0B3A5B")
    for title, header, rows in sheets:
        sheet = book.active if first else book.create_sheet(title)
        first = False
        sheet.title = title
        sheet.append(header)
        for cell in sheet[1]:
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center")
        for row in rows:
            values = []
            for key in header:
                value = row[key]
                if isinstance(value, Decimal):
                    value = float(value)
                values.append(value)
            sheet.append(values)
        for col_idx, name in enumerate(header, start=1):
            sheet.column_dimensions[get_column_letter(col_idx)].width = max(14, len(name) + 2)
        sheet.auto_filter.ref = sheet.dimensions
        sheet.freeze_panes = "A2"
        sheet.auto_filter.ref = f"A1:{get_column_letter(len(header))}{sheet.max_row}"
    book.save(path)


def sql_n(value):
    return "N'" + str(value).replace("'", "''") + "'"


def sql_date(value):
    return "'" + value.isoformat() + "'"


def sql_num(value):
    if isinstance(value, Decimal):
        return format(value, "f")
    return str(value)


def write_inserts(handle, table, columns, value_rows):
    handle.write(f"INSERT INTO {table} ({', '.join(columns)})\nVALUES\n")
    lines = []
    for values in value_rows:
        lines.append("(" + ", ".join(values) + ")")
    handle.write(",\n".join(lines))
    handle.write(";\nGO\n\n")


def write_seed(path, sales, production, inventory):
    with path.open("w", encoding="utf-8") as handle:
        handle.write(
            """/*
Load the synthetic training files into staging and build the star schema.
Run 00_create_orion_training.sql first.
Re-running this script replaces staging and rebuilds the facts.
*/
USE OrionTraining;
GO
TRUNCATE TABLE stg.SalesBilling;
TRUNCATE TABLE stg.ProductionOutput;
TRUNCATE TABLE stg.InventoryStock;
GO

"""
        )
        sales_cols = SALES_HEADER
        batch = []
        for row in sales:
            batch.append([
                sql_n(row["BillingDoc"]),
                str(row["BillingItem"]),
                sql_date(row["BillingDate"]),
                sql_n(row["CompanyCode"]),
                sql_n(row["PlantCode"]),
                sql_n(row["CustomerCode"]),
                sql_n(row["CustomerName"]),
                sql_n(row["MaterialCode"]),
                sql_n(row["MaterialName"]),
                sql_n(row["ProductGroup"]),
                sql_num(row["Quantity"]),
                sql_n(row["UoM"]),
                sql_num(row["NetAmount"]),
                sql_num(row["TaxAmount"]),
                sql_n(row["Currency"]),
            ])
            if len(batch) == 200:
                write_inserts(handle, "stg.SalesBilling", sales_cols, batch)
                batch = []
        if batch:
            write_inserts(handle, "stg.SalesBilling", sales_cols, batch)

        prod_cols = PROD_HEADER
        batch = []
        for row in production:
            batch.append([
                sql_date(row["ProdDate"]),
                sql_n(row["PlantCode"]),
                sql_n(row["PlantName"]),
                sql_n(row["MaterialCode"]),
                sql_n(row["MaterialName"]),
                sql_n(row["ProductGroup"]),
                sql_n(row["ShiftCode"]),
                sql_num(row["PlannedQty"]),
                sql_num(row["ActualQty"]),
                sql_n(row["UoM"]),
                sql_num(row["DowntimeHours"]),
            ])
            if len(batch) == 200:
                write_inserts(handle, "stg.ProductionOutput", prod_cols, batch)
                batch = []
        if batch:
            write_inserts(handle, "stg.ProductionOutput", prod_cols, batch)

        inv_cols = INV_HEADER
        batch = []
        for row in inventory:
            batch.append([
                sql_date(row["StockDate"]),
                sql_n(row["PlantCode"]),
                sql_n(row["PlantName"]),
                sql_n(row["MaterialCode"]),
                sql_n(row["MaterialName"]),
                sql_n(row["StorageLocation"]),
                sql_n(row["StockType"]),
                sql_num(row["OpeningQty"]),
                sql_num(row["ReceiptQty"]),
                sql_num(row["IssueQty"]),
                sql_num(row["ClosingQty"]),
                sql_n(row["UoM"]),
            ])
            if len(batch) == 200:
                write_inserts(handle, "stg.InventoryStock", inv_cols, batch)
                batch = []
        if batch:
            write_inserts(handle, "stg.InventoryStock", inv_cols, batch)

        handle.write("EXEC rpt.usp_RefreshFromStaging;\nGO\n")


def validate(sales, production, inventory):
    sales_keys = [(r["BillingDoc"], r["BillingItem"]) for r in sales]
    if len(sales_keys) != len(set(sales_keys)):
        raise SystemExit("Duplicate sales keys")
    prod_keys = [(r["ProdDate"], r["PlantCode"], r["MaterialCode"], r["ShiftCode"]) for r in production]
    if len(prod_keys) != len(set(prod_keys)):
        raise SystemExit("Duplicate production keys")
    inv_keys = [
        (r["StockDate"], r["PlantCode"], r["MaterialCode"], r["StorageLocation"], r["StockType"])
        for r in inventory
    ]
    if len(inv_keys) != len(set(inv_keys)):
        raise SystemExit("Duplicate inventory keys")
    for row in inventory:
        opening = Decimal(row["OpeningQty"])
        closing = Decimal(row["ClosingQty"])
        expected = opening + Decimal(row["ReceiptQty"]) - Decimal(row["IssueQty"])
        if abs(closing - expected) > Decimal("0.001"):
            raise SystemExit(f"Inventory equation failed {row}")
    net = sum((r["NetAmount"] for r in sales), Decimal("0"))
    qty_mt = Decimal("0")
    kwh = Decimal("0")
    factors = {"LPG12": Decimal("0.0125"), "LPG35": Decimal("0.035"), "LPGBULK": Decimal("1")}
    for row in sales:
        if row["MaterialCode"] == "PWRKWH":
            kwh += row["Quantity"]
        else:
            qty_mt += row["Quantity"] * factors[row["MaterialCode"]]
    print(f"sales_rows={len(sales)}")
    print(f"production_rows={len(production)}")
    print(f"inventory_rows={len(inventory)}")
    print(f"net_amount={net}")
    print(f"qty_mt={q3(qty_mt)}")
    print(f"kwh={kwh}")
    print(f"customers={len({r['CustomerCode'] for r in sales})}")
    print(f"billing_docs={len({r['BillingDoc'] for r in sales})}")


def main():
    rng = random.Random(19)
    sales = build_sales(rng)
    production = build_production(rng)
    inventory = build_inventory(rng)
    validate(sales, production, inventory)

    DATA.mkdir(parents=True, exist_ok=True)
    EXCEL.mkdir(parents=True, exist_ok=True)
    write_csv(DATA / "Sales_Billing.csv", SALES_HEADER, sales)
    write_csv(DATA / "Production_Output.csv", PROD_HEADER, production)
    write_csv(DATA / "Inventory_Stock.csv", INV_HEADER, inventory)
    write_xlsx(EXCEL / "Sales_Billing.xlsx", [("Sales", SALES_HEADER, sales)])
    write_xlsx(EXCEL / "Production_Output.xlsx", [("Production", PROD_HEADER, production)])
    write_xlsx(EXCEL / "Inventory_Stock.xlsx", [("Inventory", INV_HEADER, inventory)])
    write_xlsx(
        EXCEL / "Orion_Training_Sources.xlsx",
        [
            ("Sales", SALES_HEADER, sales),
            ("Production", PROD_HEADER, production),
            ("Inventory", INV_HEADER, inventory),
        ],
    )
    write_seed(SQL / "01_seed_sample_data.sql", sales, production, inventory)
    print("wrote files")


if __name__ == "__main__":
    main()
