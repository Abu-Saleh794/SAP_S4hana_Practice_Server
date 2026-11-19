import { useEffect, useMemo, useState } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { DATA_END, DATA_START } from "@/data/revenue";
import {
  buildView,
  clampDate,
  formatLong,
  formatMoney,
  formatPct,
  formatRange,
  formatSignedMoney,
  formatSignedPct,
  rangeForPreset,
  type Bucket,
  type PlanFilter,
  type Preset,
  type SegmentRow,
} from "@/lib/revenue-metrics";

const PRESETS: Preset[] = ["30D", "90D", "YTD", "12M", "All"];
const PLANS: PlanFilter[] = ["All", "Starter", "Growth", "Scale"];

type SortKey = "segment" | "revenue" | "share" | "growth" | "churnRate" | "customers";

const SORT_LABEL: Record<SortKey, string> = {
  segment: "Plan",
  revenue: "Revenue",
  share: "Share",
  growth: "Growth",
  churnRate: "Churn",
  customers: "Customers",
};

function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const apply = () => setNarrow(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  return narrow;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  return reduced;
}

function Hint({ label, text }: { label: string; text: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button type="button" className="text-muted" aria-label={label}>
          <Info className="size-4" aria-hidden="true" />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          className="z-20 max-w-xs rounded-lg border border-line bg-ink px-3 py-2 text-sm text-paper"
        >
          {text}
          <Tooltip.Arrow className="fill-ink" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value == null) return <span className="text-sm text-muted">No prior window of the same length</span>;
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium ${up ? "text-signal" : "text-down"}`}>
      <Icon className="size-4" aria-hidden="true" />
      {formatSignedPct(value)} vs prior period
    </span>
  );
}

function ChartTip({ active, payload }: TooltipProps<number, string>) {
  const row = payload?.[0]?.payload as Bucket | undefined;
  if (!active || !row) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-none">
      <p className="font-medium text-ink">{row.title}</p>
      <p className="mt-1 text-ink">Revenue {formatMoney(row.revenue)}</p>
      <p className="text-muted">Vs prior point {formatSignedPct(row.change)}</p>
      <p className="text-muted">
        Churn {formatPct(row.churnRate)} · {formatMoney(row.churnedRevenue)} lost
      </p>
    </div>
  );
}

function axisTick(narrow: boolean) {
  return { fill: "var(--color-muted)", fontSize: narrow ? 11 : 12 };
}

export function RevenueDashboard() {
  const [preset, setPreset] = useState<Preset | null>("12M");
  const initial = rangeForPreset("12M");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [plan, setPlan] = useState<PlanFilter>("All");
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortAsc, setSortAsc] = useState(false);
  const [chartsReady, setChartsReady] = useState(false);
  const narrow = useNarrow();
  const reduced = useReducedMotion();

  useEffect(() => {
    setChartsReady(true);
  }, []);

  const blocked = from > to;
  const view = useMemo(
    () => (blocked ? null : buildView({ from, to }, plan)),
    [blocked, from, to, plan],
  );
  const priorLabel = view?.prior ? formatRange(view.prior) : null;

  const rows = useMemo(() => {
    if (!view) return [];
    const copy = [...view.segments];
    copy.sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      const left = a[sortKey];
      const right = b[sortKey];
      if (typeof left === "string" && typeof right === "string") return left.localeCompare(right) * dir;
      const ln = left == null ? Number.NEGATIVE_INFINITY : Number(left);
      const rn = right == null ? Number.NEGATIVE_INFINITY : Number(right);
      return (ln - rn) * dir;
    });
    return copy;
  }, [view, sortKey, sortAsc]);

  function applyPreset(next: Preset) {
    const span = rangeForPreset(next);
    setPreset(next);
    setFrom(span.from);
    setTo(span.to);
  }

  function applyFrom(value: string) {
    setPreset(null);
    setFrom(clampDate(value));
  }

  function applyTo(value: string) {
    setPreset(null);
    setTo(clampDate(value));
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((value) => !value);
    else {
      setSortKey(key);
      setSortAsc(key === "segment");
    }
  }

  const grainCopy = !view
    ? "Choose a valid range"
    : view.grain === "day"
      ? "Grouped by day"
      : view.grain === "week"
        ? "Grouped by week"
        : "Grouped by month";

  return (
    <Tooltip.Provider delayDuration={250}>
      <div className="h-1 bg-signal" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-signal">Northline</p>
            <h1 className="font-display text-4xl leading-tight text-ink sm:text-5xl">Revenue</h1>
            <p className="mt-2 max-w-xl text-muted">
              Recognized revenue, growth against the previous window, and logo churn. The sample is built into
              the page, so the filters work offline.
            </p>
          </div>
          <p className="text-sm text-muted">Sample through {formatLong(DATA_END)}</p>
        </header>

        <section className="panel flex flex-col gap-4 p-4 sm:p-5" aria-label="Filters">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Date presets">
            {PRESETS.map((item) => {
              const selected = preset === item;
              return (
                <button
                  key={item}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => applyPreset(item)}
                  className={`min-h-11 rounded-lg px-3 text-sm font-medium ${
                    selected ? "bg-ink text-paper" : "border border-line bg-surface text-ink"
                  }`}
                >
                  {item}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">From</span>
              <input
                type="date"
                value={from}
                min={DATA_START}
                max={DATA_END}
                onChange={(event) => applyFrom(event.target.value)}
                className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">To</span>
              <input
                type="date"
                value={to}
                min={DATA_START}
                max={DATA_END}
                onChange={(event) => applyTo(event.target.value)}
                className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Plan">
            {PLANS.map((item) => {
              const selected = plan === item;
              return (
                <button
                  key={item}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setPlan(item)}
                  className={`min-h-11 rounded-lg px-3 text-sm font-medium ${
                    selected ? "bg-signal text-paper" : "border border-line bg-surface text-ink"
                  }`}
                >
                  {item === "All" ? "All plans" : item}
                </button>
              );
            })}
          </div>

          {blocked ? (
            <p className="text-sm text-down" role="alert">
              Start date is after the end date. Pick a range inside {formatLong(DATA_START)} to{" "}
              {formatLong(DATA_END)}.
            </p>
          ) : view ? (
            <p className="text-sm text-muted">
              {formatRange(view.range)}
              {priorLabel ? ` compared with ${priorLabel}` : " · not enough history for a prior window"}
              {" · "}
              {grainCopy}
            </p>
          ) : null}
        </section>

        <section className="grid gap-4 md:grid-cols-3" aria-label="Key figures">
          <article className="panel p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-muted">Revenue</h2>
              <Hint
                label="How revenue is calculated"
                text="Sum of recognized revenue on each day in the selected dates and plan."
              />
            </div>
            <p className="mt-3 font-display text-4xl leading-none text-ink tabular-nums">
              {view ? formatMoney(view.revenue) : "—"}
            </p>
            <p className="mt-3">
              <Delta value={view?.growth ?? null} />
            </p>
          </article>

          <article className="panel p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-muted">Growth</h2>
              <Hint
                label="How growth is calculated"
                text="This window's revenue minus the previous window of the same number of days, divided by that previous window."
              />
            </div>
            <p className="mt-3 font-display text-4xl leading-none text-ink tabular-nums">
              {view ? formatSignedPct(view.growth) : "—"}
            </p>
            <p
              className={`mt-3 text-sm font-medium ${view?.revenueDelta == null ? "text-muted" : view.revenueDelta < 0 ? "text-down" : "text-signal"}`}
            >
              {view?.revenueDelta == null
                ? "No matching prior window"
                : `${formatSignedMoney(view.revenueDelta)} versus prior window`}
            </p>
          </article>

          <article className="panel p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-muted">Churn</h2>
              <Hint
                label="How churn is calculated"
                text="Customers lost during the selected dates, divided by customers at the start of those dates. A longer range reads higher because it is not annualized."
              />
            </div>
            <p className="mt-3 font-display text-4xl leading-none text-down tabular-nums">
              {view ? formatPct(view.churnRate) : "—"}
            </p>
            <p className="mt-3 text-sm text-muted">
              {view
                ? `${view.churnedCustomers.toLocaleString("en-US")} customers · ${formatMoney(view.churnedRevenue)} lost`
                : "Pick a valid date range"}
            </p>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-5">
          <article className="panel p-4 sm:p-5 lg:col-span-3">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink">Revenue trend</h2>
              <p className="text-sm text-muted">{grainCopy}</p>
            </div>
            <div className="h-56 w-full sm:h-72">
              {chartsReady && view && view.buckets.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={view.buckets} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-signal)" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="var(--color-signal)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--color-line)" />
                    <XAxis
                      dataKey="label"
                      tick={axisTick(narrow)}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={28}
                    />
                    <YAxis
                      hide={narrow}
                      tickFormatter={(value: number) => formatMoney(value)}
                      tick={axisTick(narrow)}
                      tickLine={false}
                      axisLine={false}
                      width={64}
                    />
                    <ChartTooltip
                      content={ChartTip}
                      cursor={{ stroke: "var(--color-line)" }}
                      wrapperStyle={{ outline: "none" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="var(--color-signal)"
                      strokeWidth={2}
                      fill="url(#revenue-fill)"
                      isAnimationActive={!reduced}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="flex h-full items-center text-sm text-muted">No revenue in this range.</p>
              )}
            </div>
          </article>

          <article className="panel p-4 sm:p-5 lg:col-span-2">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink">Churn trend</h2>
              <p className="text-sm text-muted">Inside each period</p>
            </div>
            <div className="h-56 w-full sm:h-72">
              {chartsReady && view && view.buckets.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={view.buckets} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--color-line)" />
                    <XAxis
                      dataKey="label"
                      tick={axisTick(narrow)}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={28}
                    />
                    <YAxis
                      hide={narrow}
                      tickFormatter={(value: number) => `${Math.round(value * 100)}%`}
                      tick={axisTick(narrow)}
                      tickLine={false}
                      axisLine={false}
                      width={48}
                    />
                    <ChartTooltip
                      content={ChartTip}
                      cursor={{ stroke: "var(--color-line)" }}
                      wrapperStyle={{ outline: "none" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="churnRate"
                      stroke="var(--color-down)"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={!reduced}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="flex h-full items-center text-sm text-muted">No churn in this range.</p>
              )}
            </div>
          </article>
        </section>

        <section className="panel overflow-hidden" aria-labelledby="breakdown-heading">
          <div className="flex items-baseline justify-between gap-3 px-4 pt-4 sm:px-5">
            <h2 id="breakdown-heading" className="text-lg font-semibold text-ink">
              Plan breakdown
            </h2>
            <p className="text-sm text-muted">Select a plan to filter the page</p>
          </div>
          <div className="overflow-x-auto">
            <table className="breakdown-table text-left">
              <thead>
                <tr className="border-b border-line text-sm text-muted">
                  {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
                    <th key={key} scope="col" className={key === "segment" ? "px-4 sm:px-5" : "px-3 text-right"}>
                      <button
                        type="button"
                        onClick={() => toggleSort(key)}
                        className="min-h-11 font-medium"
                        aria-sort={sortKey === key ? (sortAsc ? "ascending" : "descending") : "none"}
                      >
                        {SORT_LABEL[key]}
                        {sortKey === key ? (sortAsc ? " ↑" : " ↓") : ""}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <BreakdownRow key={row.segment} row={row} selected={plan === row.segment} onSelect={setPlan} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </Tooltip.Provider>
  );
}

function BreakdownRow({
  row,
  selected,
  onSelect,
}: {
  row: SegmentRow;
  selected: boolean;
  onSelect: (plan: PlanFilter) => void;
}) {
  return (
    <tr className={selected ? "bg-signal-soft" : "border-t border-line"}>
      <th scope="row" className="px-4 font-medium sm:px-5">
        <button
          type="button"
          className="min-h-11 text-left"
          aria-pressed={selected}
          onClick={() => onSelect(selected ? "All" : row.segment)}
        >
          {row.segment}
        </button>
      </th>
      <td className="px-3 text-right tabular-nums">{formatMoney(row.revenue)}</td>
      <td className="px-3 text-right tabular-nums">{formatPct(row.share)}</td>
      <td
        className={`px-3 text-right tabular-nums ${
          row.growth == null ? "text-muted" : row.growth < 0 ? "text-down" : "text-signal"
        }`}
      >
        {formatSignedPct(row.growth)}
      </td>
      <td className="px-3 text-right tabular-nums">{formatPct(row.churnRate)}</td>
      <td className="px-3 pr-4 text-right tabular-nums sm:pr-5">{row.customers.toLocaleString("en-US")}</td>
    </tr>
  );
}
