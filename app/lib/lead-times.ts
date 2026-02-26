const DAY_MS = 24 * 60 * 60 * 1000;

type LeadTimeConfig = {
  hoursThreshold: number;
  minDaysUnderThreshold: number;
  bucketBaseDays: number;
  bucketStepDays: number;
  linearBaseDays: number;
  queueHeadroomDays: number;
  multiplierByService: Record<string, number>;
  concurrencyByService: Record<string, number>;
};

const LEAD_TIME_DEFAULT_SETTINGS = [
  { key: "lead_time_hours_threshold", label: "Lead Time Hours Threshold", unit: "hours", value: 36 },
  { key: "lead_time_min_days_under_threshold", label: "Lead Time Min Days (< threshold)", unit: "days", value: 5 },
  { key: "lead_time_bucket_base_days", label: "Lead Time Bucket Base Days", unit: "days", value: 3 },
  { key: "lead_time_bucket_step_days", label: "Lead Time Bucket Step Days", unit: "days", value: 2 },
  { key: "lead_time_linear_base_days", label: "Lead Time Linear Base Days", unit: "days", value: 10 },
  { key: "lead_time_queue_headroom_days", label: "Lead Time Queue Headroom", unit: "days", value: 2 },

  { key: "lead_time_multiplier_contract_print", label: "Lead Time Multiplier — Contract Print", unit: "x", value: 1 },
  { key: "lead_time_multiplier_scanning", label: "Lead Time Multiplier — 3D Scanning", unit: "x", value: 1 },
  { key: "lead_time_multiplier_design", label: "Lead Time Multiplier — 3D Design", unit: "x", value: 1 },
  { key: "lead_time_multiplier_testing", label: "Lead Time Multiplier — Material Testing", unit: "x", value: 1 },

  { key: "lead_time_concurrency_contract_print", label: "Queue Capacity — Contract Print", unit: "parallel jobs", value: 1 },
  { key: "lead_time_concurrency_scanning", label: "Queue Capacity — 3D Scanning", unit: "parallel jobs", value: 1 },
  { key: "lead_time_concurrency_design", label: "Queue Capacity — 3D Design", unit: "parallel jobs", value: 1 },
  { key: "lead_time_concurrency_testing", label: "Queue Capacity — Material Testing", unit: "parallel jobs", value: 1 },
] as const;

function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clampMin(value: number, min: number) {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value;
}

function serviceSuffixFromLabel(serviceLabel: string): "contract_print" | "scanning" | "design" | "testing" {
  const t = normalizeServiceQueueKey(serviceLabel);
  if (t === "Contract Print") return "contract_print";
  if (t === "3D Scanning") return "scanning";
  if (t === "3D Design") return "design";
  return "testing";
}

function getDefaultSettingValue(key: string): number {
  const found = LEAD_TIME_DEFAULT_SETTINGS.find((s) => s.key === key);
  return found ? Number(found.value) : 0;
}

export async function ensureLeadTimeSettings(supabase: any) {
  const { data: existingRows, error: existingErr } = await supabase
    .from("cost_settings")
    .select("key")
    .in(
      "key",
      LEAD_TIME_DEFAULT_SETTINGS.map((s) => s.key)
    );

  if (existingErr) throw new Error(existingErr.message);

  const existingKeys = new Set((existingRows ?? []).map((r: any) => String(r.key)));
  const missing = LEAD_TIME_DEFAULT_SETTINGS.filter((s) => !existingKeys.has(s.key));

  if (missing.length > 0) {
    const { error: insertErr } = await supabase.from("cost_settings").insert(
      missing.map((s) => ({
        key: s.key,
        label: s.label,
        unit: s.unit,
        value: s.value,
      }))
    );

    if (insertErr) throw new Error(insertErr.message);
  }
}

async function loadLeadTimeConfig(supabase: any): Promise<LeadTimeConfig> {
  await ensureLeadTimeSettings(supabase);

  const { data: rows, error } = await supabase
    .from("cost_settings")
    .select("key,value")
    .in(
      "key",
      LEAD_TIME_DEFAULT_SETTINGS.map((s) => s.key)
    );

  if (error) throw new Error(error.message);

  const byKey = new Map<string, number>((rows ?? []).map((r: any) => [String(r.key), toNum(r.value)]));

  const setting = (key: string, min: number) => {
    const raw = byKey.has(key) ? Number(byKey.get(key)) : getDefaultSettingValue(key);
    return clampMin(raw, min);
  };

  return {
    hoursThreshold: setting("lead_time_hours_threshold", 1),
    minDaysUnderThreshold: setting("lead_time_min_days_under_threshold", 1),
    bucketBaseDays: setting("lead_time_bucket_base_days", 0),
    bucketStepDays: setting("lead_time_bucket_step_days", 0),
    linearBaseDays: setting("lead_time_linear_base_days", 1),
    queueHeadroomDays: setting("lead_time_queue_headroom_days", 0),

    multiplierByService: {
      contract_print: setting("lead_time_multiplier_contract_print", 0.1),
      scanning: setting("lead_time_multiplier_scanning", 0.1),
      design: setting("lead_time_multiplier_design", 0.1),
      testing: setting("lead_time_multiplier_testing", 0.1),
    },

    concurrencyByService: {
      contract_print: Math.floor(setting("lead_time_concurrency_contract_print", 1)),
      scanning: Math.floor(setting("lead_time_concurrency_scanning", 1)),
      design: Math.floor(setting("lead_time_concurrency_design", 1)),
      testing: Math.floor(setting("lead_time_concurrency_testing", 1)),
    },
  };
}

export function quoteKeyForServiceLabel(label: string): string | null {
  const t = String(label ?? "").trim();
  if (t === "Contract Print" || t === "Contract Printing") return "CONTRACT_PRINTING";
  if (t === "3D Scanning") return "3D_SCANNING";
  if (t === "3D Design") return "3D_DESIGN";
  if (t === "Material Testing") return "MATERIAL_TESTING";
  return null;
}

export function normalizeServiceQueueKey(label: string): string {
  const t = String(label ?? "").trim();
  if (t === "Contract Printing") return "Contract Print";
  return t;
}

export function leadDaysFromQuotedHours(hours: number): number {
  const h = Math.max(0, toNum(hours));

  if (h < 36) return 5;

  const byDayBuckets = 3 + 2 * Math.ceil(h / 24);
  const byLinearCap = 10 + h / 24;
  return Math.ceil(Math.min(byDayBuckets, byLinearCap));
}

function quotedHoursForService(serviceLabel: string, quoteItemsByType: Map<string, any>): number {
  const quoteKey = quoteKeyForServiceLabel(serviceLabel);
  if (!quoteKey) return 0;

  const item = quoteItemsByType.get(quoteKey);
  if (!item) return 0;

  if (quoteKey === "CONTRACT_PRINTING") {
    const params = (item?.params ?? {}) as any;
    const printHours = toNum(item?.print_time_hours);
    const supportHours = toNum(params?.support_removal_hours);
    const setupHours = toNum(params?.setup_hours);
    const adminHours = toNum(params?.admin_hours);
    return Math.max(0, printHours + supportHours + setupHours + adminHours);
  }

  return Math.max(0, toNum(item?.labor_hours));
}

function leadDaysFromHoursAndConfig(hours: number, serviceLabel: string, cfg: LeadTimeConfig): number {
  const h = Math.max(0, toNum(hours));

  const baseDays = h < cfg.hoursThreshold
    ? cfg.minDaysUnderThreshold
    : Math.ceil(
        Math.min(
          cfg.bucketBaseDays + cfg.bucketStepDays * Math.ceil(h / 24),
          cfg.linearBaseDays + h / 24
        )
      );

  const suffix = serviceSuffixFromLabel(serviceLabel);
  const multiplier = cfg.multiplierByService[suffix] ?? 1;
  return Math.max(1, Math.ceil(baseDays * multiplier));
}

export async function recalculateLeadTimesForOpenRequests(supabase: any) {
  const cfg = await loadLeadTimeConfig(supabase);

  const { data: openRequests, error: reqErr } = await supabase
    .from("requests")
    .select("id, created_at, quote_id, overall_status")
    .neq("overall_status", "Completed")
    .order("created_at", { ascending: true });

  if (reqErr) throw new Error(reqErr.message);

  const requests = (openRequests ?? []) as Array<{
    id: string;
    created_at: string;
    quote_id: string | null;
    overall_status: string;
  }>;

  if (requests.length === 0) return;

  const requestIds = requests.map((r) => String(r.id));

  const { data: stepRows, error: stepsErr } = await supabase
    .from("request_services")
    .select("id, request_id, service_type, step_status, sort_order")
    .in("request_id", requestIds)
    .order("sort_order", { ascending: true });

  if (stepsErr) throw new Error(stepsErr.message);

  const steps = (stepRows ?? []) as Array<{
    id: string;
    request_id: string;
    service_type: string;
    step_status: string;
    sort_order: number | null;
  }>;

  const quoteIds = Array.from(
    new Set(
      requests
        .map((r) => (r.quote_id ? String(r.quote_id) : ""))
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
    const quoteId = String((row as any).quote_id ?? "");
    const serviceType = String((row as any).service_type ?? "");
    if (!quoteId || !serviceType) continue;

    if (!quoteItemsByQuoteId.has(quoteId)) {
      quoteItemsByQuoteId.set(quoteId, new Map<string, any>());
    }

    quoteItemsByQuoteId.get(quoteId)!.set(serviceType, row);
  }

  const stepIds = steps.map((s) => String(s.id));

  const { data: actualRows, error: actualErr } = stepIds.length
    ? await supabase
        .from("service_actuals")
        .select("service_id, actual_hours, data")
        .in("service_id", stepIds)
    : { data: [] as any[], error: null as any };

  if (actualErr) throw new Error(actualErr.message);

  const existingActualByServiceId = new Map<string, { actual_hours: number | null; data: any }>(
    (actualRows ?? []).map((r: any) => [String(r.service_id), { actual_hours: r.actual_hours ?? null, data: r.data ?? {} }])
  );

  const stepsByRequestId = new Map<string, typeof steps>();
  for (const s of steps) {
    const requestId = String(s.request_id);
    if (!stepsByRequestId.has(requestId)) stepsByRequestId.set(requestId, [] as any);
    stepsByRequestId.get(requestId)!.push(s);
  }

  const queueNextByServiceLanes = new Map<string, number[]>();
  const nowMs = Date.now();

  const leadByServiceId = new Map<
    string,
    {
      quoted_hours: number;
      lead_days: number;
      queue_headroom_days: number;
      queue_concurrency: number;
      lead_multiplier: number;
      starts_at: string;
      due_at: string;
      formula_version: string;
      calculated_at: string;
    }
  >();

  const requestDeadlineById = new Map<string, string | null>();

  for (const req of requests) {
    const reqId = String(req.id);
    const reqCreatedMs = Number.isFinite(Date.parse(req.created_at))
      ? Date.parse(req.created_at)
      : nowMs;

    const requestSteps = (stepsByRequestId.get(reqId) ?? [])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    const quoteMap = req.quote_id
      ? quoteItemsByQuoteId.get(String(req.quote_id)) ?? new Map<string, any>()
      : new Map<string, any>();

    let reqMaxDueMs: number | null = null;

    for (const step of requestSteps) {
      if (String(step.step_status) === "Completed") continue;

      const queueKey = normalizeServiceQueueKey(step.service_type);
      const quotedHours = quotedHoursForService(step.service_type, quoteMap);
      const leadDays = leadDaysFromHoursAndConfig(quotedHours, step.service_type, cfg);

      const suffix = serviceSuffixFromLabel(step.service_type);
      const concurrency = Math.max(1, Math.floor(cfg.concurrencyByService[suffix] ?? 1));

      if (!queueNextByServiceLanes.has(queueKey)) {
        queueNextByServiceLanes.set(queueKey, Array.from({ length: concurrency }, () => 0));
      }

      const lanes = queueNextByServiceLanes.get(queueKey)!;
      while (lanes.length < concurrency) lanes.push(0);
      if (lanes.length > concurrency) lanes.length = concurrency;

      let laneIndex = 0;
      let laneAvailableMs = lanes[0] ?? 0;
      for (let i = 1; i < lanes.length; i++) {
        if ((lanes[i] ?? 0) < laneAvailableMs) {
          laneAvailableMs = lanes[i] ?? 0;
          laneIndex = i;
        }
      }

      const startsMs = Math.max(reqCreatedMs, laneAvailableMs);
      const dueMs = startsMs + leadDays * DAY_MS;
      const nextQueueMs = dueMs + cfg.queueHeadroomDays * DAY_MS;

      lanes[laneIndex] = nextQueueMs;
      queueNextByServiceLanes.set(queueKey, lanes);

      if (reqMaxDueMs === null || dueMs > reqMaxDueMs) {
        reqMaxDueMs = dueMs;
      }

      leadByServiceId.set(String(step.id), {
        quoted_hours: Number(quotedHours.toFixed(2)),
        lead_days: leadDays,
        queue_headroom_days: cfg.queueHeadroomDays,
        queue_concurrency: concurrency,
        lead_multiplier: cfg.multiplierByService[suffix] ?? 1,
        starts_at: new Date(startsMs).toISOString(),
        due_at: new Date(dueMs).toISOString(),
        formula_version: "v2_configurable_formula_plus_service_multiplier_and_capacity",
        calculated_at: new Date(nowMs).toISOString(),
      });
    }

    requestDeadlineById.set(reqId, reqMaxDueMs ? new Date(reqMaxDueMs).toISOString() : null);
  }

  const actualUpserts = stepIds.map((serviceId) => {
    const existing = existingActualByServiceId.get(serviceId);
    const existingData = (existing?.data ?? {}) as any;
    const leadPayload = leadByServiceId.get(serviceId) ?? null;

    return {
      service_id: serviceId,
      actual_hours: existing?.actual_hours ?? null,
      data: {
        ...existingData,
        lead_time: leadPayload,
      },
    };
  });

  if (actualUpserts.length > 0) {
    const { error: upsertErr } = await supabase
      .from("service_actuals")
      .upsert(actualUpserts, { onConflict: "service_id" });

    if (upsertErr) throw new Error(upsertErr.message);
  }

  for (const req of requests) {
    const reqId = String(req.id);
    const job_deadline = requestDeadlineById.get(reqId) ?? null;

    const { error: updateReqErr } = await supabase
      .from("requests")
      .update({ job_deadline })
      .eq("id", reqId);

    if (updateReqErr) throw new Error(updateReqErr.message);
  }
}
