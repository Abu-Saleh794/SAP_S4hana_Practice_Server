import { DATA_END, DATA_START, SEGMENTS, SERIES, type RevenueRow, type Segment } from "@/data/revenue";

export type DateRange = { from: string; to: string };
export type Preset = "30D" | "90D" | "YTD" | "12M" | "All";
export type Grain = "day" | "week" | "month";
export type PlanFilter = Segment | "All";

export type Bucket = {
  key: string;
  label: string;
  title: string;
  revenue: number;
  change: number | null;
  churnRate: number | null;
  churnedRevenue: number;
};

export type SegmentRow = {
  segment: Segment;
  revenue: number;
  share: number;
  growth: number | null;
  churnRate: number | null;
  customers: number;
  churnedCustomers: number;
  churnedRevenue: number;
};

export type DashboardView = {
  range: DateRange;
  prior: DateRange | null;
  grain: Grain;
  revenue: number;
  growth: number | null;
  revenueDelta: number | null;
  churnRate: number | null;
  churnedRevenue: number;
  churnedCustomers: number;
  buckets: Bucket[];
  segments: SegmentRow[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function addUtcDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function inclusiveDays(from: string, to: string) {
  const [ay, am, ad] = from.split("-").map(Number);
  const [by, bm, bd] = to.split("-").map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86_400_000) + 1;
}

export function formatLong(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function formatRange(range: DateRange) {
  return `${formatLong(range.from)} – ${formatLong(range.to)}`;
}

export function rangeForPreset(preset: Preset): DateRange {
  if (preset === "All") return { from: DATA_START, to: DATA_END };
  if (preset === "YTD") return { from: `${DATA_END.slice(0, 4)}-01-01`, to: DATA_END };
  const span = preset === "30D" ? 29 : preset === "90D" ? 89 : 364;
  return { from: addUtcDays(DATA_END, -span), to: DATA_END };
}

export function previousWindow(range: DateRange): DateRange | null {
  const days = inclusiveDays(range.from, range.to);
  const to = addUtcDays(range.from, -1);
  const from = addUtcDays(to, -(days - 1));
  if (from < DATA_START) return null;
  return { from, to };
}

function chooseGrain(range: DateRange): Grain {
  const days = inclusiveDays(range.from, range.to);
  if (days <= 45) return "day";
  if (days <= 120) return "week";
  return "month";
}

function weekStart(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const shift = weekday === 0 ? -6 : 1 - weekday;
  return addUtcDays(iso, shift);
}

function bucketKey(date: string, grain: Grain) {
  if (grain === "month") return date.slice(0, 7);
  if (grain === "week") return weekStart(date);
  return date;
}

function bucketLabel(key: string, grain: Grain) {
  if (grain === "month") {
    const [year, month] = key.split("-").map(Number);
    return `${MONTHS[month - 1]} ${String(year).slice(2)}`;
  }
  const [, month, day] = key.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

function bucketTitle(key: string, grain: Grain) {
  if (grain === "month") {
    const [year, month] = key.split("-").map(Number);
    return `${MONTHS[month - 1]} ${year}`;
  }
  if (grain === "week") {
    const end = addUtcDays(key, 6);
    return `Week of ${formatLong(key)} – ${formatLong(end)}`;
  }
  return formatLong(key);
}

function rowsIn(range: DateRange, segment: PlanFilter) {
  return SERIES.filter(
    (row) => row.date >= range.from && row.date <= range.to && (segment === "All" || row.segment === segment),
  );
}

function startOfDay(row: RevenueRow) {
  return row.activeCustomers - row.newCustomers + row.churnedCustomers;
}

function periodStats(rows: RevenueRow[]) {
  if (rows.length === 0) {
    return { revenue: 0, churnedRevenue: 0, churnedCustomers: 0, startCustomers: 0, endCustomers: 0 };
  }
  const dates = [...new Set(rows.map((row) => row.date))].sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  return {
    revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
    churnedRevenue: rows.reduce((sum, row) => sum + row.churnedRevenue, 0),
    churnedCustomers: rows.reduce((sum, row) => sum + row.churnedCustomers, 0),
    startCustomers: rows.filter((row) => row.date === first).reduce((sum, row) => sum + startOfDay(row), 0),
    endCustomers: rows.filter((row) => row.date === last).reduce((sum, row) => sum + row.activeCustomers, 0),
  };
}

function rate(part: number, whole: number) {
  if (whole <= 0) return null;
  return part / whole;
}

function buildBuckets(rows: RevenueRow[], grain: Grain): Bucket[] {
  const groups = new Map<string, RevenueRow[]>();
  for (const row of rows) {
    const key = bucketKey(row.date, grain);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  return ordered.map(([key, group], index) => {
    const stats = periodStats(group);
    const previous = index > 0 ? periodStats(ordered[index - 1][1]) : null;
    return {
      key,
      label: bucketLabel(key, grain),
      title: bucketTitle(key, grain),
      revenue: stats.revenue,
      change: previous && previous.revenue > 0 ? (stats.revenue - previous.revenue) / previous.revenue : null,
      churnRate: rate(stats.churnedCustomers, stats.startCustomers),
      churnedRevenue: stats.churnedRevenue,
    };
  });
}

export function buildView(range: DateRange, segment: PlanFilter): DashboardView {
  const currentRows = rowsIn(range, segment);
  const current = periodStats(currentRows);
  const prior = previousWindow(range);
  const priorStats = prior ? periodStats(rowsIn(prior, segment)) : null;
  const growth =
    priorStats && priorStats.revenue > 0 ? (current.revenue - priorStats.revenue) / priorStats.revenue : null;
  const grain = chooseGrain(range);
  const company = SEGMENTS.map((name) => {
    const stats = periodStats(rowsIn(range, name));
    const before = prior ? periodStats(rowsIn(prior, name)) : null;
    return {
      segment: name,
      revenue: stats.revenue,
      churnRate: rate(stats.churnedCustomers, stats.startCustomers),
      customers: stats.endCustomers,
      churnedCustomers: stats.churnedCustomers,
      churnedRevenue: stats.churnedRevenue,
      growth: before && before.revenue > 0 ? (stats.revenue - before.revenue) / before.revenue : null,
      share: 0,
    };
  });
  const totalRevenue = company.reduce((sum, row) => sum + row.revenue, 0);
  for (const row of company) {
    row.share = totalRevenue > 0 ? row.revenue / totalRevenue : 0;
  }

  return {
    range,
    prior,
    grain,
    revenue: current.revenue,
    growth,
    revenueDelta: priorStats ? current.revenue - priorStats.revenue : null,
    churnRate: rate(current.churnedCustomers, current.startCustomers),
    churnedRevenue: current.churnedRevenue,
    churnedCustomers: current.churnedCustomers,
    buckets: buildBuckets(currentRows, grain),
    segments: company,
  };
}

export function formatMoney(value: number) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatSignedMoney(value: number) {
  const core = formatMoney(Math.abs(value));
  if (value > 0) return `+${core}`;
  if (value < 0) return `-${core.replace("-", "")}`;
  return core;
}

export function formatSignedPct(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  const pct = `${Math.abs(value * 100).toFixed(1)}%`;
  if (value > 0) return `+${pct}`;
  if (value < 0) return `-${pct}`;
  return pct;
}

export function formatPct(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function clampDate(value: string) {
  if (!value) return DATA_START;
  if (value < DATA_START) return DATA_START;
  if (value > DATA_END) return DATA_END;
  return value;
}
