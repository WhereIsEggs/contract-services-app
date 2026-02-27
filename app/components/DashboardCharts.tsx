"use client";

import { useMemo, useState } from "react";

type ChartProps = {
  statusCounts: {
    active: number;
    waiting: number;
    completed: number;
  };
  completedServices: Array<{
    completedAt: string;
    serviceType: string;
  }>;
  requestCreations: string[];
  lateOpenByService: Array<{
    serviceType: string;
    count: number;
  }>;
};

function toDateMs(raw: string) {
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : NaN;
}

function fmtShortDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function buildSeries(values: number[], labels: string[], colorClass: string) {
  const max = Math.max(1, ...values);
  return values.map((v, i) => ({
    key: i,
    value: v,
    label: labels[i] ?? `Bin ${i + 1}`,
    heightPct: Math.max(4, Math.round((v / max) * 100)),
    colorClass,
  }));
}

function rangeBuckets(nowMs: number, days: number, bins: number) {
  const windowMs = days * 24 * 60 * 60 * 1000;
  const startMs = nowMs - windowMs;
  const binMs = windowMs / bins;

  return {
    startMs,
    binMs,
    indexFor: (ms: number) => {
      if (!Number.isFinite(ms) || ms < startMs || ms > nowMs) return -1;
      const idx = Math.floor((ms - startMs) / binMs);
      return Math.min(bins - 1, Math.max(0, idx));
    },
    labelFor: (idx: number) => {
      const clamped = Math.min(bins - 1, Math.max(0, idx));
      const binStart = startMs + clamped * binMs;
      const binEnd = Math.min(nowMs, binStart + binMs - 1);
      return `${fmtShortDate(binStart)}–${fmtShortDate(binEnd)}`;
    },
    bins,
  };
}

export default function DashboardCharts({
  statusCounts,
  completedServices,
  requestCreations,
  lateOpenByService,
}: ChartProps) {
  const [periodDays, setPeriodDays] = useState<30 | 90 | 365>(90);

  const totals = statusCounts.active + statusCounts.waiting + statusCounts.completed;

  const statusBars = useMemo(() => {
    const max = Math.max(1, statusCounts.active, statusCounts.waiting, statusCounts.completed);
    return [
      { label: "In Progress", value: statusCounts.active, pct: Math.round((statusCounts.active / max) * 100), cls: "bg-blue-500" },
      { label: "Waiting", value: statusCounts.waiting, pct: Math.round((statusCounts.waiting / max) * 100), cls: "bg-amber-500" },
      { label: "Completed", value: statusCounts.completed, pct: Math.round((statusCounts.completed / max) * 100), cls: "bg-emerald-500" },
    ];
  }, [statusCounts.active, statusCounts.waiting, statusCounts.completed]);

  const trend = useMemo(() => {
    const nowMs = Date.now();
    const bins = periodDays === 30 ? 10 : 12;
    const bucket = rangeBuckets(nowMs, periodDays, bins);

    const completed = Array.from({ length: bins }, () => 0);
    const created = Array.from({ length: bins }, () => 0);
    const labels = Array.from({ length: bins }, (_, i) => bucket.labelFor(i));

    for (const row of completedServices) {
      const idx = bucket.indexFor(toDateMs(row.completedAt));
      if (idx >= 0) completed[idx] += 1;
    }

    for (const raw of requestCreations) {
      const idx = bucket.indexFor(toDateMs(raw));
      if (idx >= 0) created[idx] += 1;
    }

    return {
      labels,
      completedSeries: buildSeries(completed, labels, "bg-emerald-500/80"),
      createdSeries: buildSeries(created, labels, "bg-violet-500/80"),
      completedTotal: completed.reduce((a, b) => a + b, 0),
      createdTotal: created.reduce((a, b) => a + b, 0),
    };
  }, [completedServices, requestCreations, periodDays]);

  const lateServicesTop = useMemo(
    () => lateOpenByService.slice().sort((a, b) => b.count - a.count).slice(0, 5),
    [lateOpenByService]
  );

  return (
    <section className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-neutral-100">Interactive Analytics</h3>
        <div className="inline-flex rounded-md border border-neutral-600 bg-neutral-800/80 p-1">
          {[30, 90, 365].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setPeriodDays(d as 30 | 90 | 365)}
              className={`h-7 rounded px-2.5 text-xs ${
                periodDays === d
                  ? "bg-neutral-100 text-neutral-900"
                  : "text-neutral-300 hover:bg-neutral-700"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-md border border-neutral-700 bg-neutral-900/50 p-3">
          <div className="text-xs text-neutral-400">Current Request Mix</div>
          <div className="mt-2 text-xs text-neutral-500">Total tracked: {totals}</div>
          <div className="mt-3 grid gap-2">
            {statusBars.map((b) => (
              <div key={b.label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-neutral-300">{b.label}</span>
                  <span className="text-neutral-200">{b.value}</span>
                </div>
                <div className="h-2 rounded bg-neutral-800/80">
                  <div className={`h-2 rounded ${b.cls}`} style={{ width: `${Math.max(6, b.pct)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-neutral-700 bg-neutral-900/50 p-3 lg:col-span-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-400">Trend ({periodDays} days)</span>
            <span className="text-neutral-500">
              Created: {trend.createdTotal} • Completed: {trend.completedTotal}
            </span>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-[11px] text-neutral-400">Requests Created</div>
              <div className="flex h-24 items-end gap-1 rounded border border-neutral-700 bg-neutral-900/70 p-2">
                {trend.createdSeries.map((bar) => (
                  <div
                    key={`created-${bar.key}`}
                    title={`${bar.label}: ${bar.value} created`}
                    className={`w-full rounded-sm ${bar.colorClass}`}
                    style={{ height: `${bar.heightPct}%` }}
                  />
                ))}
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-500">
                <span>{trend.labels[0] ?? ""}</span>
                <span>{trend.labels[trend.labels.length - 1] ?? ""}</span>
              </div>
              <div className="mt-0.5 text-[10px] text-neutral-500">Hover a bar for exact date range and value.</div>
            </div>

            <div>
              <div className="mb-1 text-[11px] text-neutral-400">Services Completed</div>
              <div className="flex h-24 items-end gap-1 rounded border border-neutral-700 bg-neutral-900/70 p-2">
                {trend.completedSeries.map((bar) => (
                  <div
                    key={`completed-${bar.key}`}
                    title={`${bar.label}: ${bar.value} completed`}
                    className={`w-full rounded-sm ${bar.colorClass}`}
                    style={{ height: `${bar.heightPct}%` }}
                  />
                ))}
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-500">
                <span>{trend.labels[0] ?? ""}</span>
                <span>{trend.labels[trend.labels.length - 1] ?? ""}</span>
              </div>
              <div className="mt-0.5 text-[10px] text-neutral-500">Hover a bar for exact date range and value.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-md border border-neutral-700 bg-neutral-900/50 p-3">
        <div className="text-xs text-neutral-400">Late Open Services by Type</div>
        {lateServicesTop.length === 0 ? (
          <div className="mt-2 text-sm text-neutral-500">No open late services right now.</div>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lateServicesTop.map((s) => (
              <div key={s.serviceType} className="rounded border border-neutral-700 bg-neutral-900/60 px-2 py-1.5">
                <div className="text-xs text-neutral-300 truncate" title={s.serviceType}>{s.serviceType}</div>
                <div className="text-sm font-semibold text-red-300">{s.count}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
