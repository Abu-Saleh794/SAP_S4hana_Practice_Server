export const SEGMENTS = ["Starter", "Growth", "Scale"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const DATA_START = "2024-11-19";
export const DATA_END = "2026-11-18";

export type RevenueRow = {
  date: string;
  segment: Segment;
  revenue: number;
  newCustomers: number;
  churnedCustomers: number;
  activeCustomers: number;
  churnedRevenue: number;
};

type Profile = {
  segment: Segment;
  customers: number;
  arpu: number;
  monthlyChurn: number;
  newPerDay: number;
};

const PROFILES: Profile[] = [
  { segment: "Starter", customers: 480, arpu: 49, monthlyChurn: 0.045, newPerDay: 2.4 },
  { segment: "Growth", customers: 210, arpu: 189, monthlyChurn: 0.028, newPerDay: 0.85 },
  { segment: "Scale", customers: 54, arpu: 890, monthlyChurn: 0.012, newPerDay: 0.18 },
];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(lambda: number, rng: () => number) {
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

function isoFromUtc(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

function buildSeries(): RevenueRow[] {
  const rng = mulberry32(20261118);
  const rows: RevenueRow[] = [];
  const state = PROFILES.map((profile) => ({ ...profile }));
  const cursor = new Date(Date.UTC(2024, 10, 19));
  const end = new Date(Date.UTC(2026, 10, 18));
  let monthIndex = 0;
  let lastMonth = 10;

  while (cursor.getTime() <= end.getTime()) {
    const month = cursor.getUTCMonth();
    if (month !== lastMonth) {
      monthIndex += 1;
      lastMonth = month;
    }
    const weekday = cursor.getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    const season = 1 + 0.035 * Math.sin((monthIndex / 12) * Math.PI * 2);
    const date = isoFromUtc(cursor.getUTCFullYear(), month, cursor.getUTCDate());

    for (const plan of state) {
      const opening = plan.customers;
      const lost = Math.min(poisson((opening * plan.monthlyChurn) / 30, rng), opening);
      let arrived = poisson(plan.newPerDay * season * (weekend ? 0.4 : 1), rng);
      let closing = opening - lost + arrived;
      if (closing < 8) {
        arrived += 8 - closing;
        closing = 8;
      }
      plan.customers = closing;
      const noise = 0.97 + rng() * 0.06;
      const weekendFactor = weekend ? 0.84 : 1;
      let revenue = closing * (plan.arpu / 30) * weekendFactor * noise * season;
      if (plan.segment === "Scale" && cursor.getUTCDate() === 15 && rng() > 0.45) {
        revenue += plan.arpu * (1 + rng());
      }
      rows.push({
        date,
        segment: plan.segment,
        revenue: Math.round(revenue * 100) / 100,
        newCustomers: arrived,
        churnedCustomers: lost,
        activeCustomers: closing,
        churnedRevenue: Math.round(lost * plan.arpu * 100) / 100,
      });
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return rows;
}

export const SERIES: RevenueRow[] = buildSeries();
