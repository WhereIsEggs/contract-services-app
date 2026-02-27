import { createClient } from "@/app/lib/supabase/server";
import { quoteKeyForServiceLabel } from "@/app/lib/lead-times";
import { NextResponse } from "next/server";
import * as ExcelJS from "exceljs";

export const runtime = "nodejs";

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
  period: "quarter" | "semi_first" | "semi_second" | "annual" | "custom";
  year: number;
  quarter: number;
  half: number;
};

function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function ymd(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mdy(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${m}/${day}/${y}`;
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
    rawPeriod === "semi"
      ? Number(sp?.half ?? "") === 2
        ? "semi_second"
        : "semi_first"
      : rawPeriod === "semi_first" || rawPeriod === "semi_second" || rawPeriod === "annual" || rawPeriod === "custom"
        ? (rawPeriod as DateRange["period"])
        : "quarter";

  const year = Math.max(2020, Number(sp?.year ?? String(currentYear)) || currentYear);
  const quarter = Math.min(4, Math.max(1, Number(sp?.quarter ?? String(currentQuarter)) || currentQuarter));
  const half = period === "semi_second" ? 2 : period === "semi_first" ? 1 : Math.min(2, Math.max(1, Number(sp?.half ?? String(currentHalf)) || currentHalf));

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
        label: `${mdy(parsedStart)} to ${mdy(parsedEnd)}`,
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

  if (period === "semi_first" || period === "semi_second") {
    const isFirstHalf = period === "semi_first";
    const startMonth = isFirstHalf ? 0 : 6;
    const endMonth = isFirstHalf ? 6 : 12;
    const start = new Date(Date.UTC(year, startMonth, 1));
    const endExclusive = new Date(Date.UTC(year, endMonth, 1));
    return {
      startIso: start.toISOString(),
      endIso: endExclusive.toISOString(),
      startInput: ymd(start),
      endInput: ymd(new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000)),
      label: isFirstHalf ? `Semi-Annual Jan-Jun ${year}` : `Semi-Annual Jul-Dec ${year}`,
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

function csvEscape(value: any) {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes("\n") || s.includes("\"")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function line(values: any[]) {
  return `${values.map(csvEscape).join(",")}\n`;
}

function simpleDate(value: string | undefined | null) {
  const ms = value ? Date.parse(String(value)) : NaN;
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const y = d.getFullYear();
  return `${m}/${day}/${y}`;
}

function formatInputDate(value: string | undefined | null) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  return `${match[2]}/${match[3]}/${match[1]}`;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { searchParams } = new URL(request.url);
  const sp: ReportsSearchParams = {
    period: searchParams.get("period") ?? undefined,
    year: searchParams.get("year") ?? undefined,
    quarter: searchParams.get("quarter") ?? undefined,
    half: searchParams.get("half") ?? undefined,
    start: searchParams.get("start") ?? undefined,
    end: searchParams.get("end") ?? undefined,
  };
  const format = String(searchParams.get("format") ?? "summary").toLowerCase();

  const range = resolveDateRange(sp);

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
  const detailedRows: Array<{
    request_number: string;
    customer_name: string;
    service_type: string;
    completed_at: string;
    due_at: string;
    late: boolean;
    quoted_hours: number;
    actual_hours: number;
    hour_variance: number;
    quoted_internal: number;
    actual_internal: number;
    cost_variance: number;
    profit_loss: number;
    profit_loss_status: "profit" | "loss" | "break-even";
  }> = [];

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

    detailedRows.push({
      request_number:
        req?.request_number != null && Number.isFinite(Number(req.request_number))
          ? String(Number(req.request_number)).padStart(5, "0")
          : "",
      customer_name: String(req?.customer_name ?? ""),
      service_type: String(step.service_type ?? ""),
      completed_at: String(step.completed_at ?? ""),
      due_at: Number.isFinite(dueMs) ? new Date(dueMs).toISOString() : "",
      late: Boolean(isLate),
      quoted_hours: quotedHours,
      actual_hours: actualHours,
      hour_variance: actualHours - quotedHours,
      quoted_internal: quotedCost,
      actual_internal: actualCost,
      cost_variance: actualCost - quotedCost,
      profit_loss: quotedCost - actualCost,
      profit_loss_status:
        quotedCost - actualCost > 0 ? "profit" : quotedCost - actualCost < 0 ? "loss" : "break-even",
    });

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

  const sortedDetailedRows = [...detailedRows].sort((a, b) => {
    const aId = Number.parseInt(String(a.request_number), 10);
    const bId = Number.parseInt(String(b.request_number), 10);
    const aKey = Number.isFinite(aId) ? aId : Number.MAX_SAFE_INTEGER;
    const bKey = Number.isFinite(bId) ? bId : Number.MAX_SAFE_INTEGER;
    if (aKey !== bKey) return aKey - bKey;
    return Date.parse(a.completed_at) - Date.parse(b.completed_at);
  });

  let csv = "";

  if (format === "detail_xlsx") {
    const totalProfitLoss = totalQuotedInternal - totalActualInternal;
    const fileStamp = range.label.replace(/\s+/g, "_").replace(/[^A-Za-z0-9_-]/g, "");

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Detailed Report");

    ws.addRow(["Report", "Period", range.label]);
    ws.addRow(["Date Range Start", formatInputDate(range.startInput)]);
    ws.addRow(["Date Range End", formatInputDate(range.endInput)]);
    ws.addRow(["Total Quoted Cost", totalQuotedInternal]);
    ws.addRow(["Profit/Loss Total", totalProfitLoss]);
    ws.addRow(["Profit/Loss Status", totalProfitLoss > 0 ? "profit" : totalProfitLoss < 0 ? "loss" : "break-even"]);
    ws.addRow([]);

    const headers = [
      "Request ID",
      "Customer",
      "Service",
      "Completed At",
      "Due At",
      "Late",
      "Quoted Hours",
      "Actual Hours",
      "Hour Variance",
      "Quoted Cost",
      "Actual Cost",
      "Cost Variance",
      "Profit/Loss",
      "Profit/Loss Status",
    ];
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true };

    ws.columns = [
      { width: 24 },
      { width: 24 },
      { width: 18 },
      { width: 18 },
      { width: 18 },
      { width: 8 },
      { width: 13 },
      { width: 13 },
      { width: 13 },
      { width: 13 },
      { width: 13 },
      { width: 13 },
      { width: 13 },
      { width: 16 },
    ];

    for (const r of sortedDetailedRows) {
      const row = ws.addRow([
        r.request_number,
        r.customer_name,
        r.service_type,
        simpleDate(r.completed_at),
        simpleDate(r.due_at),
        r.late ? "yes" : "no",
        r.quoted_hours,
        r.actual_hours,
        r.hour_variance,
        r.quoted_internal,
        r.actual_internal,
        r.cost_variance,
        r.profit_loss,
        r.profit_loss_status,
      ]);

      row.getCell(1).numFmt = "@";
      for (const col of [7, 8, 9, 10, 11, 12, 13]) {
        row.getCell(col).numFmt = "0.00";
      }

      if (r.profit_loss > 0) {
        row.getCell(13).font = { color: { argb: "FF166534" } };
        row.getCell(14).font = { color: { argb: "FF166534" } };
      } else if (r.profit_loss < 0) {
        row.getCell(13).font = { color: { argb: "FFB91C1C" } };
        row.getCell(14).font = { color: { argb: "FFB91C1C" } };
      }
    }

    ws.getCell("B4").numFmt = "0.00";
    ws.getCell("B5").numFmt = "0.00";
    if (totalProfitLoss > 0) {
      ws.getCell("B5").font = { color: { argb: "FF166534" }, bold: true };
      ws.getCell("B6").font = { color: { argb: "FF166534" }, bold: true };
    } else if (totalProfitLoss < 0) {
      ws.getCell("B5").font = { color: { argb: "FFB91C1C" }, bold: true };
      ws.getCell("B6").font = { color: { argb: "FFB91C1C" }, bold: true };
    }

    const excelBuffer = await workbook.xlsx.writeBuffer();
    const bytes = excelBuffer instanceof ArrayBuffer ? new Uint8Array(excelBuffer) : new Uint8Array(excelBuffer as any);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=report_detailed_${fileStamp || "period"}.xlsx`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (format === "detail") {
    const totalProfitLoss = totalQuotedInternal - totalActualInternal;
    csv += line(["Report", "Period", range.label]);
    csv += line(["Date Range Start", formatInputDate(range.startInput)]);
    csv += line(["Date Range End", formatInputDate(range.endInput)]);
    csv += line(["Total Quoted Cost", totalQuotedInternal.toFixed(2)]);
    csv += line(["Profit/Loss Total", totalProfitLoss.toFixed(2)]);
    csv += line(["Profit/Loss Status", totalProfitLoss > 0 ? "profit" : totalProfitLoss < 0 ? "loss" : "break-even"]);
    csv += line([]);
    csv += line([
      "Request ID",
      "Customer",
      "Service",
      "Completed At",
      "Due At",
      "Late",
      "Quoted Hours",
      "Actual Hours",
      "Hour Variance",
      "Quoted Cost",
      "Actual Cost",
      "Cost Variance",
      "Profit/Loss",
      "Profit/Loss Status",
    ]);

    for (const r of sortedDetailedRows) {
      csv += line([
        r.request_number,
        r.customer_name,
        r.service_type,
        simpleDate(r.completed_at),
        simpleDate(r.due_at),
        r.late ? "yes" : "no",
        r.quoted_hours.toFixed(2),
        r.actual_hours.toFixed(2),
        r.hour_variance.toFixed(2),
        r.quoted_internal.toFixed(2),
        r.actual_internal.toFixed(2),
        r.cost_variance.toFixed(2),
        r.profit_loss.toFixed(2),
        r.profit_loss_status,
      ]);
    }

    const fileStamp = range.label.replace(/\s+/g, "_").replace(/[^A-Za-z0-9_-]/g, "");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=report_detailed_${fileStamp || "period"}.csv`,
        "Cache-Control": "no-store",
      },
    });
  }

  csv += line(["Report", "Period", range.label]);
  csv += line(["Date Range Start", formatInputDate(range.startInput)]);
  csv += line(["Date Range End", formatInputDate(range.endInput)]);
  csv += line([]);

  csv += line(["KPI", "Value"]);
  csv += line(["Requests Created", requestsCreatedCount]);
  csv += line(["Requests Completed (created in period)", requestsCreatedCompletedCount]);
  csv += line(["Services Completed", completedSteps.length]);
  csv += line(["Requests With Completed Work", completedRequestIdsInPeriod.size]);
  csv += line(["Quoted Hours", totalQuotedHours.toFixed(2)]);
  csv += line(["Actual Hours", totalActualHours.toFixed(2)]);
  csv += line(["Internal Cost Variance", (totalActualInternal - totalQuotedInternal).toFixed(2)]);
  csv += line(["Late Completion Rate", lateCompletionRate.toFixed(4)]);
  csv += line(["Open Late Services (live)", openLateServiceCount]);
  csv += line([]);

  csv += line([
    "Service",
    "Completed",
    "Late Count",
    "Late Rate",
    "Quoted Hours",
    "Actual Hours",
    "Hour Variance",
    "Quoted Internal",
    "Actual Internal",
    "Cost Variance",
  ]);

  for (const r of serviceRows) {
    csv += line([
      r.service,
      r.completedCount,
      r.lateCount,
      r.lateRate.toFixed(4),
      r.quotedHours.toFixed(2),
      r.actualHours.toFixed(2),
      r.hourVariance.toFixed(2),
      r.quotedCost.toFixed(2),
      r.actualCost.toFixed(2),
      r.costVariance.toFixed(2),
    ]);
  }

  const fileStamp = range.label.replace(/\s+/g, "_").replace(/[^A-Za-z0-9_-]/g, "");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=report_${fileStamp || "period"}.csv`,
      "Cache-Control": "no-store",
    },
  });
}
