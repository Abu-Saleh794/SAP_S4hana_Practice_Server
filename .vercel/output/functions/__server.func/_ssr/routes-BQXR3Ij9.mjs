import { i as __toESM } from "../_runtime.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { i as ArrowDownRight, n as Info, r as ArrowUpRight } from "../_libs/lucide-react.mjs";
import { a as TooltipProvider, i as TooltipPortal, n as TooltipArrow, o as TooltipTrigger, r as TooltipContent, t as Tooltip } from "../_libs/@radix-ui/react-tooltip+[...].mjs";
import { a as Area, c as ResponsiveContainer, i as XAxis, l as Tooltip$1, n as LineChart, o as Line, r as YAxis, s as CartesianGrid, t as AreaChart } from "../_libs/recharts+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-BQXR3Ij9.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var SEGMENTS = [
	"Starter",
	"Growth",
	"Scale"
];
var DATA_START = "2025-01-01";
var DATA_END = "2026-11-18";
var PROFILES = [
	{
		segment: "Starter",
		customers: 480,
		arpu: 49,
		monthlyChurn: .045,
		newPerDay: 2.4
	},
	{
		segment: "Growth",
		customers: 210,
		arpu: 189,
		monthlyChurn: .028,
		newPerDay: .85
	},
	{
		segment: "Scale",
		customers: 54,
		arpu: 890,
		monthlyChurn: .012,
		newPerDay: .18
	}
];
function mulberry32(seed) {
	let a = seed;
	return () => {
		a |= 0;
		a = a + 1831565813 | 0;
		let t = Math.imul(a ^ a >>> 15, 1 | a);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
function poisson(lambda, rng) {
	if (lambda <= 0) return 0;
	const limit = Math.exp(-lambda);
	let k = 0;
	let p = 1;
	do {
		k += 1;
		p *= rng();
	} while (p > limit && k < 40);
	return k - 1;
}
function isoFromUtc(year, monthIndex, day) {
	return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}
function buildSeries() {
	const rng = mulberry32(20261118);
	const rows = [];
	const state = PROFILES.map((profile) => ({ ...profile }));
	const cursor = new Date(Date.UTC(2025, 0, 1));
	const end = new Date(Date.UTC(2026, 10, 18));
	let monthIndex = 0;
	let lastMonth = 0;
	while (cursor.getTime() <= end.getTime()) {
		const month = cursor.getUTCMonth();
		if (month !== lastMonth) {
			monthIndex += 1;
			lastMonth = month;
		}
		const weekday = cursor.getUTCDay();
		const weekend = weekday === 0 || weekday === 6;
		const season = 1 + .035 * Math.sin(monthIndex / 12 * Math.PI * 2);
		const date = isoFromUtc(cursor.getUTCFullYear(), month, cursor.getUTCDate());
		for (const plan of state) {
			const opening = plan.customers;
			const lost = Math.min(poisson(opening * plan.monthlyChurn / 30, rng), opening);
			let arrived = poisson(plan.newPerDay * season * (weekend ? .4 : 1), rng);
			let closing = opening - lost + arrived;
			if (closing < 8) {
				arrived += 8 - closing;
				closing = 8;
			}
			plan.customers = closing;
			const noise = .97 + rng() * .06;
			const weekendFactor = weekend ? .84 : 1;
			let revenue = closing * (plan.arpu / 30) * weekendFactor * noise * season;
			if (plan.segment === "Scale" && cursor.getUTCDate() === 15 && rng() > .45) revenue += plan.arpu * (1 + rng());
			rows.push({
				date,
				segment: plan.segment,
				revenue: Math.round(revenue * 100) / 100,
				newCustomers: arrived,
				churnedCustomers: lost,
				activeCustomers: closing,
				churnedRevenue: Math.round(lost * plan.arpu * 100) / 100
			});
		}
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return rows;
}
var SERIES = buildSeries();
var MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec"
];
function addUtcDays(iso, days) {
	const [year, month, day] = iso.split("-").map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}
function inclusiveDays(from, to) {
	const [ay, am, ad] = from.split("-").map(Number);
	const [by, bm, bd] = to.split("-").map(Number);
	const a = Date.UTC(ay, am - 1, ad);
	const b = Date.UTC(by, bm - 1, bd);
	return Math.round((b - a) / 864e5) + 1;
}
function formatLong(iso) {
	const [year, month, day] = iso.split("-").map(Number);
	return `${day} ${MONTHS[month - 1]} ${year}`;
}
function formatRange(range) {
	return `${formatLong(range.from)} – ${formatLong(range.to)}`;
}
function rangeForPreset(preset) {
	if (preset === "All") return {
		from: DATA_START,
		to: DATA_END
	};
	if (preset === "YTD") return {
		from: `${DATA_END.slice(0, 4)}-01-01`,
		to: DATA_END
	};
	return {
		from: addUtcDays(DATA_END, -(preset === "30D" ? 29 : preset === "90D" ? 89 : 364)),
		to: DATA_END
	};
}
function previousWindow(range) {
	const days = inclusiveDays(range.from, range.to);
	const to = addUtcDays(range.from, -1);
	const from = addUtcDays(to, -(days - 1));
	if (from < "2025-01-01") return null;
	return {
		from,
		to
	};
}
function chooseGrain(range) {
	const days = inclusiveDays(range.from, range.to);
	if (days <= 45) return "day";
	if (days <= 120) return "week";
	return "month";
}
function weekStart(iso) {
	const [year, month, day] = iso.split("-").map(Number);
	const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
	return addUtcDays(iso, weekday === 0 ? -6 : 1 - weekday);
}
function bucketKey(date, grain) {
	if (grain === "month") return date.slice(0, 7);
	if (grain === "week") return weekStart(date);
	return date;
}
function bucketLabel(key, grain) {
	if (grain === "month") {
		const [year, month] = key.split("-").map(Number);
		return `${MONTHS[month - 1]} ${String(year).slice(2)}`;
	}
	const [, month, day] = key.split("-").map(Number);
	return `${day} ${MONTHS[month - 1]}`;
}
function bucketTitle(key, grain) {
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
function rowsIn(range, segment) {
	return SERIES.filter((row) => row.date >= range.from && row.date <= range.to && (segment === "All" || row.segment === segment));
}
function startOfDay(row) {
	return row.activeCustomers - row.newCustomers + row.churnedCustomers;
}
function periodStats(rows) {
	if (rows.length === 0) return {
		revenue: 0,
		churnedRevenue: 0,
		churnedCustomers: 0,
		startCustomers: 0,
		endCustomers: 0
	};
	const dates = [...new Set(rows.map((row) => row.date))].sort();
	const first = dates[0];
	const last = dates[dates.length - 1];
	return {
		revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
		churnedRevenue: rows.reduce((sum, row) => sum + row.churnedRevenue, 0),
		churnedCustomers: rows.reduce((sum, row) => sum + row.churnedCustomers, 0),
		startCustomers: rows.filter((row) => row.date === first).reduce((sum, row) => sum + startOfDay(row), 0),
		endCustomers: rows.filter((row) => row.date === last).reduce((sum, row) => sum + row.activeCustomers, 0)
	};
}
function rate(part, whole) {
	if (whole <= 0) return null;
	return part / whole;
}
function buildBuckets(rows, grain) {
	const groups = /* @__PURE__ */ new Map();
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
			churnedRevenue: stats.churnedRevenue
		};
	});
}
function buildView(range, segment) {
	const currentRows = rowsIn(range, segment);
	const current = periodStats(currentRows);
	const prior = previousWindow(range);
	const priorStats = prior ? periodStats(rowsIn(prior, segment)) : null;
	const growth = priorStats && priorStats.revenue > 0 ? (current.revenue - priorStats.revenue) / priorStats.revenue : null;
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
			share: 0
		};
	});
	const totalRevenue = company.reduce((sum, row) => sum + row.revenue, 0);
	for (const row of company) row.share = totalRevenue > 0 ? row.revenue / totalRevenue : 0;
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
		segments: company
	};
}
function formatMoney(value) {
	const sign = value < 0 ? "-" : "";
	const abs = Math.abs(value);
	if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
	if (abs >= 1e4) return `${sign}$${(abs / 1e3).toFixed(1)}k`;
	return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
function formatSignedMoney(value) {
	const core = formatMoney(Math.abs(value));
	if (value > 0) return `+${core}`;
	if (value < 0) return `-${core.replace("-", "")}`;
	return core;
}
function formatSignedPct(value) {
	if (value == null || !Number.isFinite(value)) return "—";
	const pct = `${Math.abs(value * 100).toFixed(1)}%`;
	if (value > 0) return `+${pct}`;
	if (value < 0) return `-${pct}`;
	return pct;
}
function formatPct(value) {
	if (value == null || !Number.isFinite(value)) return "—";
	return `${(value * 100).toFixed(1)}%`;
}
function clampDate(value) {
	if (!value) return DATA_START;
	if (value < "2025-01-01") return DATA_START;
	if (value > "2026-11-18") return DATA_END;
	return value;
}
var PRESETS = [
	"30D",
	"90D",
	"YTD",
	"12M",
	"All"
];
var PLANS = [
	"All",
	"Starter",
	"Growth",
	"Scale"
];
var SORT_LABEL = {
	segment: "Plan",
	revenue: "Revenue",
	share: "Share",
	growth: "Growth",
	churnRate: "Churn",
	customers: "Customers"
};
function useNarrow() {
	const [narrow, setNarrow] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		const query = window.matchMedia("(max-width: 639px)");
		const apply = () => setNarrow(query.matches);
		apply();
		query.addEventListener("change", apply);
		return () => query.removeEventListener("change", apply);
	}, []);
	return narrow;
}
function useReducedMotion() {
	const [reduced, setReduced] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		const query = window.matchMedia("(prefers-reduced-motion: reduce)");
		const apply = () => setReduced(query.matches);
		apply();
		query.addEventListener("change", apply);
		return () => query.removeEventListener("change", apply);
	}, []);
	return reduced;
}
function Hint({ label, text }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
		asChild: true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			className: "text-muted",
			"aria-label": label,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Info, {
				className: "size-4",
				"aria-hidden": "true"
			})
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipPortal, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TooltipContent, {
		side: "top",
		className: "z-20 max-w-xs rounded-lg border border-line bg-ink px-3 py-2 text-sm text-paper",
		children: [text, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipArrow, { className: "fill-ink" })]
	}) })] });
}
function Delta({ value }) {
	if (value == null) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: "text-sm text-muted",
		children: "No prior window of the same length"
	});
	const up = value >= 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: `inline-flex items-center gap-1 text-sm font-medium ${up ? "text-signal" : "text-down"}`,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(up ? ArrowUpRight : ArrowDownRight, {
				className: "size-4",
				"aria-hidden": "true"
			}),
			formatSignedPct(value),
			" vs prior period"
		]
	});
}
function ChartTip({ active, payload }) {
	const row = payload?.[0]?.payload;
	if (!active || !row) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-none",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "font-medium text-ink",
				children: row.title
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-1 text-ink",
				children: ["Revenue ", formatMoney(row.revenue)]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-muted",
				children: ["Vs prior point ", formatSignedPct(row.change)]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-muted",
				children: [
					"Churn ",
					formatPct(row.churnRate),
					" · ",
					formatMoney(row.churnedRevenue),
					" lost"
				]
			})
		]
	});
}
function axisTick(narrow) {
	return {
		fill: "var(--color-muted)",
		fontSize: narrow ? 11 : 12
	};
}
function RevenueDashboard() {
	const [preset, setPreset] = (0, import_react.useState)("12M");
	const initial = rangeForPreset("12M");
	const [from, setFrom] = (0, import_react.useState)(initial.from);
	const [to, setTo] = (0, import_react.useState)(initial.to);
	const [plan, setPlan] = (0, import_react.useState)("All");
	const [sortKey, setSortKey] = (0, import_react.useState)("revenue");
	const [sortAsc, setSortAsc] = (0, import_react.useState)(false);
	const [chartsReady, setChartsReady] = (0, import_react.useState)(false);
	const narrow = useNarrow();
	const reduced = useReducedMotion();
	(0, import_react.useEffect)(() => {
		setChartsReady(true);
	}, []);
	const blocked = from > to;
	const view = (0, import_react.useMemo)(() => blocked ? null : buildView({
		from,
		to
	}, plan), [
		blocked,
		from,
		to,
		plan
	]);
	const priorLabel = view?.prior ? formatRange(view.prior) : null;
	const rows = (0, import_react.useMemo)(() => {
		if (!view) return [];
		const copy = [...view.segments];
		copy.sort((a, b) => {
			const dir = sortAsc ? 1 : -1;
			const left = a[sortKey];
			const right = b[sortKey];
			if (typeof left === "string" && typeof right === "string") return left.localeCompare(right) * dir;
			return ((left == null ? Number.NEGATIVE_INFINITY : Number(left)) - (right == null ? Number.NEGATIVE_INFINITY : Number(right))) * dir;
		});
		return copy;
	}, [
		view,
		sortKey,
		sortAsc
	]);
	function applyPreset(next) {
		const span = rangeForPreset(next);
		setPreset(next);
		setFrom(span.from);
		setTo(span.to);
	}
	function applyFrom(value) {
		setPreset(null);
		setFrom(clampDate(value));
	}
	function applyTo(value) {
		setPreset(null);
		setTo(clampDate(value));
	}
	function toggleSort(key) {
		if (sortKey === key) setSortAsc((value) => !value);
		else {
			setSortKey(key);
			setSortAsc(key === "segment");
		}
	}
	const grainCopy = !view ? "Choose a valid range" : view.grain === "day" ? "Grouped by day" : view.grain === "week" ? "Grouped by week" : "Grouped by month";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TooltipProvider, {
		delayDuration: 250,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-1 bg-signal" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
					className: "flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm font-medium text-signal",
							children: "Northline"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
							className: "font-display text-4xl leading-tight text-ink sm:text-5xl",
							children: "Revenue"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 max-w-xl text-muted",
							children: "Recognized revenue, growth against the previous window, and logo churn. The sample is built into the page, so the filters work offline."
						})
					] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-sm text-muted",
						children: ["Sample through ", formatLong(DATA_END)]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "panel flex flex-col gap-4 p-4 sm:p-5",
					"aria-label": "Filters",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex flex-wrap gap-2",
							role: "group",
							"aria-label": "Date presets",
							children: PRESETS.map((item) => {
								const selected = preset === item;
								return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-pressed": selected,
									onClick: () => applyPreset(item),
									className: `min-h-11 rounded-lg px-3 text-sm font-medium ${selected ? "bg-ink text-paper" : "border border-line bg-surface text-ink"}`,
									children: item
								}, item);
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid gap-3 sm:grid-cols-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "flex flex-col gap-1 text-sm",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-muted",
									children: "From"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "date",
									value: from,
									min: DATA_START,
									max: DATA_END,
									onChange: (event) => applyFrom(event.target.value),
									className: "min-h-11 rounded-lg border border-line bg-surface px-3 text-ink"
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "flex flex-col gap-1 text-sm",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-muted",
									children: "To"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "date",
									value: to,
									min: DATA_START,
									max: DATA_END,
									onChange: (event) => applyTo(event.target.value),
									className: "min-h-11 rounded-lg border border-line bg-surface px-3 text-ink"
								})]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex flex-wrap gap-2",
							role: "group",
							"aria-label": "Plan",
							children: PLANS.map((item) => {
								const selected = plan === item;
								return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-pressed": selected,
									onClick: () => setPlan(item),
									className: `min-h-11 rounded-lg px-3 text-sm font-medium ${selected ? "bg-signal text-paper" : "border border-line bg-surface text-ink"}`,
									children: item === "All" ? "All plans" : item
								}, item);
							})
						}),
						blocked ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-sm text-down",
							role: "alert",
							children: [
								"Start date is after the end date. Pick a range inside ",
								formatLong(DATA_START),
								" to",
								" ",
								formatLong(DATA_END),
								"."
							]
						}) : view ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-sm text-muted",
							children: [
								formatRange(view.range),
								priorLabel ? ` compared with ${priorLabel}` : " · not enough history for a prior window",
								" · ",
								grainCopy
							]
						}) : null
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "grid gap-4 md:grid-cols-3",
					"aria-label": "Key figures",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
							className: "panel p-5",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center justify-between gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
										className: "text-sm font-medium text-muted",
										children: "Revenue"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Hint, {
										label: "How revenue is calculated",
										text: "Sum of recognized revenue on each day in the selected dates and plan."
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-3 font-display text-4xl leading-none text-ink tabular-nums",
									children: view ? formatMoney(view.revenue) : "—"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-3",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Delta, { value: view?.growth ?? null })
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
							className: "panel p-5",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center justify-between gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
										className: "text-sm font-medium text-muted",
										children: "Growth"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Hint, {
										label: "How growth is calculated",
										text: "This window's revenue minus the previous window of the same number of days, divided by that previous window."
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-3 font-display text-4xl leading-none text-ink tabular-nums",
									children: view ? formatSignedPct(view.growth) : "—"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: `mt-3 text-sm font-medium ${view?.revenueDelta == null ? "text-muted" : view.revenueDelta < 0 ? "text-down" : "text-signal"}`,
									children: view?.revenueDelta == null ? "No matching prior window" : `${formatSignedMoney(view.revenueDelta)} versus prior window`
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
							className: "panel p-5",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center justify-between gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
										className: "text-sm font-medium text-muted",
										children: "Churn"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Hint, {
										label: "How churn is calculated",
										text: "Customers lost during the selected dates, divided by customers at the start of those dates. A longer range reads higher because it is not annualized."
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-3 font-display text-4xl leading-none text-down tabular-nums",
									children: view ? formatPct(view.churnRate) : "—"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-3 text-sm text-muted",
									children: view ? `${view.churnedCustomers.toLocaleString("en-US")} customers · ${formatMoney(view.churnedRevenue)} lost` : "Pick a valid date range"
								})
							]
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "grid gap-4 lg:grid-cols-5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
						className: "panel p-4 sm:p-5 lg:col-span-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mb-4 flex items-baseline justify-between gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "text-lg font-semibold text-ink",
								children: "Revenue trend"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-sm text-muted",
								children: grainCopy
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "h-56 w-full sm:h-72",
							children: chartsReady && view && view.buckets.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ResponsiveContainer, {
								width: "100%",
								height: "100%",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AreaChart, {
									data: view.buckets,
									margin: {
										top: 8,
										right: 8,
										left: 0,
										bottom: 0
									},
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("defs", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", {
											id: "revenue-fill",
											x1: "0",
											y1: "0",
											x2: "0",
											y2: "1",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
												offset: "0%",
												stopColor: "var(--color-signal)",
												stopOpacity: .28
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
												offset: "100%",
												stopColor: "var(--color-signal)",
												stopOpacity: 0
											})]
										}) }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CartesianGrid, {
											vertical: false,
											stroke: "var(--color-line)"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(XAxis, {
											dataKey: "label",
											tick: axisTick(narrow),
											tickLine: false,
											axisLine: false,
											minTickGap: 28
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(YAxis, {
											hide: narrow,
											tickFormatter: (value) => formatMoney(value),
											tick: axisTick(narrow),
											tickLine: false,
											axisLine: false,
											width: 64
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tooltip$1, {
											content: ChartTip,
											cursor: { stroke: "var(--color-line)" },
											wrapperStyle: { outline: "none" }
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Area, {
											type: "monotone",
											dataKey: "revenue",
											stroke: "var(--color-signal)",
											strokeWidth: 2,
											fill: "url(#revenue-fill)",
											isAnimationActive: !reduced
										})
									]
								})
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "flex h-full items-center text-sm text-muted",
								children: "No revenue in this range."
							})
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
						className: "panel p-4 sm:p-5 lg:col-span-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mb-4 flex items-baseline justify-between gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "text-lg font-semibold text-ink",
								children: "Churn trend"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-sm text-muted",
								children: "Logo churn"
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "h-56 w-full sm:h-72",
							children: chartsReady && view && view.buckets.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ResponsiveContainer, {
								width: "100%",
								height: "100%",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(LineChart, {
									data: view.buckets,
									margin: {
										top: 8,
										right: 8,
										left: 0,
										bottom: 0
									},
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CartesianGrid, {
											vertical: false,
											stroke: "var(--color-line)"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(XAxis, {
											dataKey: "label",
											tick: axisTick(narrow),
											tickLine: false,
											axisLine: false,
											minTickGap: 28
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(YAxis, {
											hide: narrow,
											tickFormatter: (value) => `${Math.round(value * 100)}%`,
											tick: axisTick(narrow),
											tickLine: false,
											axisLine: false,
											width: 48
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tooltip$1, {
											content: ChartTip,
											cursor: { stroke: "var(--color-line)" },
											wrapperStyle: { outline: "none" }
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Line, {
											type: "monotone",
											dataKey: "churnRate",
											stroke: "var(--color-down)",
											strokeWidth: 2,
											dot: false,
											isAnimationActive: !reduced
										})
									]
								})
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "flex h-full items-center text-sm text-muted",
								children: "No churn in this range."
							})
						})]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "panel overflow-hidden",
					"aria-labelledby": "breakdown-heading",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-baseline justify-between gap-3 px-4 pt-4 sm:px-5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							id: "breakdown-heading",
							className: "text-lg font-semibold text-ink",
							children: "Plan breakdown"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-muted",
							children: "Select a plan to filter the page"
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "overflow-x-auto",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
							className: "breakdown-table text-left",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", {
								className: "border-b border-line text-sm text-muted",
								children: Object.keys(SORT_LABEL).map((key) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									scope: "col",
									className: key === "segment" ? "px-4 sm:px-5" : "px-3 text-right",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
										type: "button",
										onClick: () => toggleSort(key),
										className: "min-h-11 font-medium",
										"aria-sort": sortKey === key ? sortAsc ? "ascending" : "descending" : "none",
										children: [SORT_LABEL[key], sortKey === key ? sortAsc ? " ↑" : " ↓" : ""]
									})
								}, key))
							}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BreakdownRow, {
								row,
								selected: plan === row.segment,
								onSelect: setPlan
							}, row.segment)) })]
						})
					})]
				})
			]
		})]
	});
}
function BreakdownRow({ row, selected, onSelect }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
		className: selected ? "bg-signal-soft" : "border-t border-line",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
				scope: "row",
				className: "px-4 font-medium sm:px-5",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "min-h-11 text-left",
					"aria-pressed": selected,
					onClick: () => onSelect(selected ? "All" : row.segment),
					children: row.segment
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
				className: "px-3 text-right tabular-nums",
				children: formatMoney(row.revenue)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
				className: "px-3 text-right tabular-nums",
				children: formatPct(row.share)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
				className: `px-3 text-right tabular-nums ${row.growth == null ? "text-muted" : row.growth < 0 ? "text-down" : "text-signal"}`,
				children: formatSignedPct(row.growth)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
				className: "px-3 text-right tabular-nums",
				children: formatPct(row.churnRate)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
				className: "px-3 pr-4 text-right tabular-nums sm:pr-5",
				children: row.customers.toLocaleString("en-US")
			})
		]
	});
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RevenueDashboard, {});
}
//#endregion
export { Home as component };
