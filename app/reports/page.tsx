import AppShell from "@/app/components/AppShell";
import { createClient } from "@/app/lib/supabase/server";
import { quoteKeyForServiceLabel } from "@/app/lib/lead-times";
import { redirect } from "next/navigation";

type ReportsSearchParams = {
  period?: string;
  year?: string;
  quarter?: string;
  half?: string;
  start?: string;
  end?: string;
};

type DateRange = {
  startIso: string;
  endIso: string;
  startInput: string;
  endInput: string;
  label: string;
  period: "quarter" | "semi" | "annual" | "custom";
  year: number;
  quarter: number;
  half: number;
};

function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtHours(n: number) {
  return `${n.toFixed(2)}h`;
}

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function ymd(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmdUtc(raw: string | undefined) {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function resolveDateRange(sp?: ReportsSearchParams): DateRange {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentQuarter = Math.floor(now.getUTCMonth() / 3) + 1;
  const currentHalf = now.getUTCMonth() < 6 ? 1 : 2;

  const rawPeriod = String(sp?.period ?? "quarter").toLowerCase();
  const period: DateRange["period"] =
    rawPeriod === "semi" || rawPeriod === "annual" || rawPeriod === "custom"
      ? (rawPeriod as any)
      : "quarter";

  const year = Math.max(2020, Number(sp?.year ?? String(currentYear)) || currentYear);
  const quarter = Math.min(4, Math.max(1, Number(sp?.quarter ?? String(currentQuarter)) || currentQuarter));
  const half = Math.min(2, Math.max(1, Number(sp?.half ?? String(currentHalf)) || currentHalf));

  if (period === "custom") {
    const parsedStart = parseYmdUtc(sp?.start);
    const parsedEnd = parseYmdUtc(sp?.end);

    if (parsedStart && parsedEnd && parsedEnd.getTime() >= parsedStart.getTime()) {
      const endExclusive = new Date(parsedEnd.getTime() + 24 * 60 * 60 * 1000);
      return {
        startIso: parsedStart.toISOString(),
        endIso: endExclusive.toISOString(),
        startInput: ymd(parsedStart),
        endInput: ymd(parsedEnd),
        label: `${ymd(parsedStart)} to ${ymd(parsedEnd)}`,
        period,
        year,
        quarter,
        half,
      };
    }
  }

  if (period === "annual") {
    const start = new Date(Date.UTC(year, 0, 1));
    const endExclusive = new Date(Date.UTC(year + 1, 0, 1));
    return {
      startIso: start.toISOString(),
      endIso: endExclusive.toISOString(),
      startInput: ymd(start),
      endInput: ymd(new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000)),
      label: `Year ${year}`,
      period,
      year,
      quarter,
      half,
    };
  }

  if (period === "semi") {
    const startMonth = half === 1 ? 0 : 6;
    const endMonth = half === 1 ? 6 : 12;
    const start = new Date(Date.UTC(year, startMonth, 1));
    const endExclusive = new Date(Date.UTC(year, endMonth, 1));
    return {
      startIso: start.toISOString(),
      endIso: endExclusive.toISOString(),
      startInput: ymd(start),
      endInput: ymd(new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000)),
      label: `H${half} ${year}`,
      period,
      year,
      quarter,
      half,
    };
  }

  const startMonth = (quarter - 1) * 3;
  const endMonth = startMonth + 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const endExclusive = new Date(Date.UTC(year, endMonth, 1));
  return {
    startIso: start.toISOString(),
    endIso: endExclusive.toISOString(),
    startInput: ymd(start),
    endInput: ymd(new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000)),
    label: `Q${quarter} ${year}`,
    period: "quarter",
    year,
    quarter,
    half,
  };
}

function internalRateForQuoteKey(quoteKey: string, settingsMap: Map<string, number>) {
  if (quoteKey === "3D_SCANNING") return toNum(settingsMap.get("scanning_internal_rate"));
  if (quoteKey === "3D_DESIGN") return toNum(settingsMap.get("design_internal_rate"));
  if (quoteKey === "MATERIAL_TESTING") return toNum(settingsMap.get("testing_internal_rate"));
  return 0;
}

function quoteHoursFromItem(serviceLabel: string, item: any) {
  if (!item) return 0;
  const quoteKey = quoteKeyForServiceLabel(serviceLabel);
  if (!quoteKey) return 0;

  if (quoteKey === "CONTRACT_PRINTING") {
    const p = (item?.params ?? {}) as any;
    return (
      toNum(item?.print_time_hours) +
      toNum(p?.support_removal_hours) +
      toNum(p?.setup_hours) +
      toNum(p?.admin_hours)
    );
  }

  return toNum(item?.labor_hours);
}

function actualHoursFromActual(serviceLabel: string, actualRow: any) {
  const quoteKey = quoteKeyForServiceLabel(serviceLabel);
  if (!quoteKey) return 0;

  if (quoteKey === "CONTRACT_PRINTING") {
    const calc = (actualRow?.data as any)?.contract_print?.calc_actual ?? {};
    return (
      toNum(calc?.actual_print_time_hours) +
      toNum(calc?.actual_setup_hours) +
      toNum(calc?.actual_support_removal_hours)
    );
  }

  return toNum(actualRow?.actual_hours);
}

function quotedInternalCost(serviceLabel: string, item: any, settingsMap: Map<string, number>) {
  if (!item) return 0;
  const quoteKey = quoteKeyForServiceLabel(serviceLabel);
  if (!quoteKey) return 0;

  if (quoteKey === "CONTRACT_PRINTING") {
    return toNum((item?.params as any)?.calc?.V2_internalTotalCost);
  }

  const hrs = quoteHoursFromItem(serviceLabel, item);
  const rate = internalRateForQuoteKey(quoteKey, settingsMap);
  return hrs * rate;
}

function actualInternalCost(serviceLabel: string, actualRow: any, settingsMap: Map<string, number>) {
  const quoteKey = quoteKeyForServiceLabel(serviceLabel);
  if (!quoteKey) return 0;

  if (quoteKey === "CONTRACT_PRINTING") {
    return toNum((actualRow?.data as any)?.contract_print?.calc_actual?.V2_internalTotalCost);
  }

  const hrs = actualHoursFromActual(serviceLabel, actualRow);
  const rate = internalRateForQuoteKey(quoteKey, settingsMap);
  return hrs * rate;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: Promise<ReportsSearchParams>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const sp = await searchParams;
  const range = resolveDateRange(sp);
  const exportParams = new URLSearchParams({
    period: range.period,
    year: String(range.year),
    quarter: String(range.quarter),
    half: String(range.half),
    start: range.startInput,
    end: range.endInput,
  });
  const exportSummaryHref = `/reports/export?${exportParams.toString()}`;
  const exportDetailHref = `/reports/export?${new URLSearchParams({
    ...Object.fromEntries(exportParams.entries()),
    format: "detail",
  }).toString()}`;

  const { data: settingsRows } = await supabase.from("cost_settings").select("key,value");
  const settingsMap = new Map<string, number>((settingsRows ?? []).map((r: any) => [String(r.key), toNum(r.value)]));

  const { data: completedStepsRows, error: completedErr } = await supabase
    .from("request_services")
    .select("id, request_id, service_type, step_status, completed_at")
    .eq("step_status", "Completed")
    .gte("completed_at", range.startIso)
    .lt("completed_at", range.endIso);

  if (completedErr) throw new Error(completedErr.message);

  const completedSteps = (completedStepsRows ?? []) as Array<{
    id: string;
    request_id: string;
    service_type: string;
    step_status: string;
    completed_at: string;
  }>;

  const requestIdsFromCompleted = Array.from(new Set(completedSteps.map((s) => String(s.request_id)).filter(Boolean)));

  const { data: periodRequestsRows, error: reqErr } = await supabase
    .from("requests")
    .select("id, quote_id, created_at, overall_status")
    .gte("created_at", range.startIso)
    .lt("created_at", range.endIso);

  if (reqErr) throw new Error(reqErr.message);

  const periodRequests = (periodRequestsRows ?? []) as Array<{
    id: string;
    quote_id: string | null;
    created_at: string;
    overall_status: string;
  }>;

  const { data: completedScopeRequestsRows, error: completedScopeReqErr } = requestIdsFromCompleted.length
    ? await supabase
        .from("requests")
        .select("id, quote_id, request_number, customer_name")
        .in("id", requestIdsFromCompleted)
    : { data: [] as any[], error: null as any };

  if (completedScopeReqErr) throw new Error(completedScopeReqErr.message);

  const requestById = new Map<string, any>((completedScopeRequestsRows ?? []).map((r: any) => [String(r.id), r]));

  const quoteIds = Array.from(
    new Set(
      (completedScopeRequestsRows ?? [])
        .map((r: any) => (r.quote_id ? String(r.quote_id) : ""))
        .filter(Boolean)
    )
  );

  const { data: quoteItemsRows, error: qiErr } = quoteIds.length
    ? await supabase
        .from("quote_items")
        .select("quote_id, service_type, labor_hours, print_time_hours, params")
        .in("quote_id", quoteIds)
    : { data: [] as any[], error: null as any };

  if (qiErr) throw new Error(qiErr.message);

  const quoteItemsByQuoteId = new Map<string, Map<string, any>>();
  for (const row of quoteItemsRows ?? []) {
    const qid = String((row as any).quote_id ?? "");
    const serviceType = String((row as any).service_type ?? "");
    if (!qid || !serviceType) continue;
    if (!quoteItemsByQuoteId.has(qid)) quoteItemsByQuoteId.set(qid, new Map<string, any>());
    quoteItemsByQuoteId.get(qid)!.set(serviceType, row);
  }

  const completedServiceIds = completedSteps.map((s) => String(s.id));

  const { data: completedActualRows, error: actualErr } = completedServiceIds.length
    ? await supabase
        .from("service_actuals")
        .select("service_id, actual_hours, data")
        .in("service_id", completedServiceIds)
    : { data: [] as any[], error: null as any };

  if (actualErr) throw new Error(actualErr.message);

  const actualByServiceId = new Map<string, any>((completedActualRows ?? []).map((r: any) => [String(r.service_id), r]));

  let totalQuotedHours = 0;
  let totalActualHours = 0;
  let totalQuotedInternal = 0;
  let totalActualInternal = 0;

  let servicesWithDue = 0;
  let lateCompletedServices = 0;

  const byService = new Map<
    string,
    {
      completedCount: number;
      lateCount: number;
      quotedHours: number;
      actualHours: number;
      quotedCost: number;
      actualCost: number;
    }
  >();

  for (const step of completedSteps) {
    const req = requestById.get(String(step.request_id));
    const quoteId = req?.quote_id ? String(req.quote_id) : "";
    const quoteKey = quoteKeyForServiceLabel(step.service_type);
    const quoteItem = quoteKey && quoteId ? quoteItemsByQuoteId.get(quoteId)?.get(quoteKey) : null;
    const actualRow = actualByServiceId.get(String(step.id));

    const quotedHours = quoteHoursFromItem(step.service_type, quoteItem);
    const actualHours = actualHoursFromActual(step.service_type, actualRow);
    const quotedCost = quotedInternalCost(step.service_type, quoteItem, settingsMap);
    const actualCost = actualInternalCost(step.service_type, actualRow, settingsMap);

    totalQuotedHours += quotedHours;
    totalActualHours += actualHours;
    totalQuotedInternal += quotedCost;
    totalActualInternal += actualCost;

    const dueAt = (actualRow?.data as any)?.lead_time?.due_at;
    const dueMs = dueAt ? Date.parse(String(dueAt)) : NaN;
    const completedMs = step.completed_at ? Date.parse(String(step.completed_at)) : NaN;
    const isLate = Number.isFinite(dueMs) && Number.isFinite(completedMs) && completedMs > dueMs;

    if (Number.isFinite(dueMs)) {
      servicesWithDue += 1;
      if (isLate) lateCompletedServices += 1;
    }

    const key = String(step.service_type ?? "Unknown");
    if (!byService.has(key)) {
      byService.set(key, {
        completedCount: 0,
        lateCount: 0,
        quotedHours: 0,
        actualHours: 0,
        quotedCost: 0,
        actualCost: 0,
      });
    }

    const row = byService.get(key)!;
    row.completedCount += 1;
    if (isLate) row.lateCount += 1;
    row.quotedHours += quotedHours;
    row.actualHours += actualHours;
    row.quotedCost += quotedCost;
    row.actualCost += actualCost;
  }

  const { data: openStepsRows, error: openStepsErr } = await supabase
    .from("request_services")
    .select("id, step_status")
    .neq("step_status", "Completed");

  if (openStepsErr) throw new Error(openStepsErr.message);

  const openStepIds = (openStepsRows ?? []).map((s: any) => String(s.id)).filter(Boolean);

  const { data: openActualRows, error: openActualErr } = openStepIds.length
    ? await supabase
        .from("service_actuals")
        .select("service_id, data")
        .in("service_id", openStepIds)
    : { data: [] as any[], error: null as any };

  if (openActualErr) throw new Error(openActualErr.message);

  const nowMs = Date.now();
  const openLateServiceCount = (openActualRows ?? []).filter((r: any) => {
    const dueAt = (r?.data as any)?.lead_time?.due_at;
    const dueMs = dueAt ? Date.parse(String(dueAt)) : NaN;
    return Number.isFinite(dueMs) && dueMs < nowMs;
  }).length;

  const requestsCreatedCount = periodRequests.length;
  const requestsCreatedCompletedCount = periodRequests.filter((r) => String(r.overall_status) === "Completed").length;
  const completedRequestIdsInPeriod = new Set(completedSteps.map((s) => String(s.request_id)));

  const lateCompletionRate = servicesWithDue > 0 ? lateCompletedServices / servicesWithDue : 0;

  const serviceRows = Array.from(byService.entries())
    .map(([service, v]) => ({
      service,
      ...v,
      hourVariance: v.actualHours - v.quotedHours,
      costVariance: v.actualCost - v.quotedCost,
      lateRate: v.completedCount > 0 ? v.lateCount / v.completedCount : 0,
    }))
    .sort((a, b) => b.completedCount - a.completedCount);

  return (
    <AppShell title="Reports" activeNav="reports">
      <div className="mx-auto w-full max-w-6xl grid gap-6">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Quote vs Actual, timing, and late-job performance for {range.label}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={exportSummaryHref}
              className="inline-flex h-9 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 px-3 text-xs text-neutral-100 hover:bg-neutral-800"
            >
              Export Summary CSV
            </a>
            <a
              href={exportDetailHref}
              className="inline-flex h-9 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 px-3 text-xs text-neutral-100 hover:bg-neutral-800"
            >
              Export Detailed CSV
            </a>
          </div>
        </div>

        <form action="/reports" method="get" className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 grid gap-3 md:grid-cols-6">
          <label className="grid gap-1 md:col-span-2">
            <span className="text-xs text-neutral-400">Period</span>
            <select name="period" defaultValue={range.period} className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100">
              <option value="quarter">Quarter</option>
              <option value="semi">Semi-Annual</option>
              <option value="annual">Annual</option>
              <option value="custom">Custom</option>
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-neutral-400">Year</span>
            <input name="year" type="number" defaultValue={range.year} className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100" />
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-neutral-400">Quarter</span>
            <select name="quarter" defaultValue={String(range.quarter)} className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100">
              <option value="1">Q1</option>
              <option value="2">Q2</option>
              <option value="3">Q3</option>
              <option value="4">Q4</option>
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-neutral-400">Half</span>
            <select name="half" defaultValue={String(range.half)} className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100">
              <option value="1">H1</option>
              <option value="2">H2</option>
            </select>
          </label>

          <button type="submit" className="h-10 rounded-md border border-neutral-700 bg-neutral-900 px-4 text-sm font-medium text-neutral-100 hover:bg-neutral-800 md:self-end">
            Run report
          </button>

          <label className="grid gap-1 md:col-span-2">
            <span className="text-xs text-neutral-400">Custom start</span>
            <input name="start" type="date" defaultValue={range.startInput} className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100" />
          </label>

          <label className="grid gap-1 md:col-span-2">
            <span className="text-xs text-neutral-400">Custom end</span>
            <input name="end" type="date" defaultValue={range.endInput} className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100" />
          </label>
        </form>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
            <div className="text-xs text-neutral-400">Requests Created</div>
            <div className="mt-1 text-2xl font-semibold text-neutral-100">{requestsCreatedCount}</div>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
            <div className="text-xs text-neutral-400">Requests Completed (created in period)</div>
            <div className="mt-1 text-2xl font-semibold text-neutral-100">{requestsCreatedCompletedCount}</div>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
            <div className="text-xs text-neutral-400">Services Completed</div>
            <div className="mt-1 text-2xl font-semibold text-neutral-100">{completedSteps.length}</div>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
            <div className="text-xs text-neutral-400">Requests With Completed Work</div>
            <div className="mt-1 text-2xl font-semibold text-neutral-100">{completedRequestIdsInPeriod.size}</div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
            <div className="text-xs text-neutral-400">Quoted Hours</div>
            <div className="mt-1 text-xl font-semibold text-neutral-100">{fmtHours(totalQuotedHours)}</div>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
            <div className="text-xs text-neutral-400">Actual Hours</div>
            <div className="mt-1 text-xl font-semibold text-neutral-100">{fmtHours(totalActualHours)}</div>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
            <div className="text-xs text-neutral-400">Internal Cost Variance</div>
            <div className={`mt-1 text-xl font-semibold ${(totalActualInternal - totalQuotedInternal) > 0 ? "text-red-300" : "text-emerald-300"}`}>
              {fmtMoney(totalActualInternal - totalQuotedInternal)}
            </div>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
            <div className="text-xs text-neutral-400">Late Completion Rate</div>
            <div className="mt-1 text-xl font-semibold text-neutral-100">{fmtPct(lateCompletionRate)}</div>
          </div>
        </section>

        <section className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
          <h2 className="text-lg font-semibold text-neutral-100">Service Performance</h2>
          <p className="mt-1 text-sm text-neutral-400">Completed services in selected period.</p>

          <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-950/60 text-left text-neutral-300">
                <tr className="border-b border-neutral-800">
                  <th className="px-3 py-2">Service</th>
                  <th className="px-3 py-2">Completed</th>
                  <th className="px-3 py-2">Late %</th>
                  <th className="px-3 py-2">Quoted Hrs</th>
                  <th className="px-3 py-2">Actual Hrs</th>
                  <th className="px-3 py-2">Hour Var</th>
                  <th className="px-3 py-2">Quoted Internal</th>
                  <th className="px-3 py-2">Actual Internal</th>
                  <th className="px-3 py-2">Cost Var</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800 bg-neutral-950/30">
                {serviceRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-neutral-400" colSpan={9}>No completed services in this period.</td>
                  </tr>
                ) : (
                  serviceRows.map((r) => (
                    <tr key={r.service}>
                      <td className="px-3 py-2 text-neutral-200">{r.service}</td>
                      <td className="px-3 py-2 text-neutral-200">{r.completedCount}</td>
                      <td className="px-3 py-2 text-neutral-200">{fmtPct(r.lateRate)}</td>
                      <td className="px-3 py-2 text-neutral-200">{fmtHours(r.quotedHours)}</td>
                      <td className="px-3 py-2 text-neutral-200">{fmtHours(r.actualHours)}</td>
                      <td className={`px-3 py-2 ${r.hourVariance > 0 ? "text-red-300" : "text-emerald-300"}`}>{fmtHours(r.hourVariance)}</td>
                      <td className="px-3 py-2 text-neutral-200">{fmtMoney(r.quotedCost)}</td>
                      <td className="px-3 py-2 text-neutral-200">{fmtMoney(r.actualCost)}</td>
                      <td className={`px-3 py-2 ${r.costVariance > 0 ? "text-red-300" : "text-emerald-300"}`}>{fmtMoney(r.costVariance)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
          <h2 className="text-lg font-semibold text-neutral-100">Late Jobs Snapshot</h2>
          <p className="mt-1 text-sm text-neutral-400">Open services currently past due (live count).</p>
          <div className="mt-2 text-2xl font-semibold text-red-300">{openLateServiceCount}</div>
        </section>
      </div>
    </AppShell>
  );
}
