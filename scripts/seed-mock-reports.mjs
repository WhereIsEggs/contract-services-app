import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL_RAW = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESET = process.argv.includes("--reset");
const MOCK_USER_ID = String(process.env.MOCK_USER_ID ?? "").trim();
const MOCK_USER_EMAIL = String(process.env.MOCK_USER_EMAIL ?? "").trim().toLowerCase();

function normalizeUrl(raw) {
  return String(raw ?? "").trim().replace(/\/+$/, "");
}

function validateSupabaseUrl(url) {
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
  }

  if (!/^https:\/\//i.test(url)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must start with https://");
  }

  const lower = url.toLowerCase();

  if (
    lower.includes("/dashboard") ||
    lower.includes("supabase.com/dashboard") ||
    lower.includes("studio")
  ) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL appears to be a Supabase Studio/dashboard URL. Use the Project API URL (https://<project-ref>.supabase.co), not the dashboard URL."
    );
  }
}

const SUPABASE_URL = normalizeUrl(SUPABASE_URL_RAW);

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing env vars. Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

try {
  validateSupabaseUrl(SUPABASE_URL);
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DAY_MS = 24 * 60 * 60 * 1000;

const SERVICE_LABELS = ["3D Scanning", "3D Design", "Contract Print"];

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function hours(n) {
  return Math.round(n * 100) / 100;
}

function quoteKeyForServiceLabel(label) {
  if (label === "Contract Print" || label === "Contract Printing") return "CONTRACT_PRINTING";
  if (label === "3D Scanning") return "3D_SCANNING";
  if (label === "3D Design") return "3D_DESIGN";
  if (label === "Material Testing") return "MATERIAL_TESTING";
  return null;
}

function serviceSortOrder(label) {
  if (label === "3D Scanning") return 10;
  if (label === "3D Design") return 20;
  if (label === "Contract Print") return 30;
  if (label === "Material Testing") return 40;
  return 999;
}

function leadDaysFromHours(h) {
  if (h < 36) return 5;
  return Math.ceil(Math.min(3 + 2 * Math.ceil(h / 24), 10 + h / 24));
}

async function loadCostSettings() {
  const { data, error } = await supabase.from("cost_settings").select("key,value");
  if (error) throw new Error(error.message);

  const map = new Map((data ?? []).map((r) => [String(r.key), toNum(r.value)]));
  return {
    scanningInternalRate: toNum(map.get("scanning_internal_rate"), 45),
    designInternalRate: toNum(map.get("design_internal_rate"), 55),
    testingInternalRate: toNum(map.get("testing_internal_rate"), 35),
  };
}

async function loadMaterialIds() {
  const { data, error } = await supabase
    .from("material_costs")
    .select("id")
    .eq("is_active", true)
    .limit(10);

  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => String(m.id));
}

async function resolveMockOwnerId() {
  if (MOCK_USER_ID) return MOCK_USER_ID;

  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`Unable to list users for mock seeding: ${error.message}`);

  const users = data?.users ?? [];
  if (!users.length) {
    throw new Error("No auth users found. Create at least one user account, then run the seed again.");
  }

  if (MOCK_USER_EMAIL) {
    const byEmail = users.find((u) => String(u.email ?? "").toLowerCase() === MOCK_USER_EMAIL);
    if (!byEmail) {
      throw new Error(`MOCK_USER_EMAIL '${MOCK_USER_EMAIL}' was not found in auth users.`);
    }
    return String(byEmail.id);
  }

  return String(users[0].id);
}

async function cleanupMocks() {
  const { data: reqRows, error: reqErr } = await supabase
    .from("requests")
    .select("id, quote_id")
    .like("project_details", "[MOCK]%");

  if (reqErr) throw new Error(reqErr.message);
  if (!reqRows || reqRows.length === 0) return;

  const requestIds = reqRows.map((r) => String(r.id));
  const quoteIds = reqRows.map((r) => (r.quote_id ? String(r.quote_id) : "")).filter(Boolean);

  const { data: svcRows, error: svcErr } = await supabase
    .from("request_services")
    .select("id")
    .in("request_id", requestIds);

  if (svcErr) throw new Error(svcErr.message);

  const serviceIds = (svcRows ?? []).map((s) => String(s.id));

  if (serviceIds.length) {
    const { error } = await supabase.from("service_actuals").delete().in("service_id", serviceIds);
    if (error) throw new Error(error.message);
  }

  if (requestIds.length) {
    const { error: svcDelErr } = await supabase.from("request_services").delete().in("request_id", requestIds);
    if (svcDelErr) throw new Error(svcDelErr.message);

    const { error: reqDelErr } = await supabase.from("requests").delete().in("id", requestIds);
    if (reqDelErr) throw new Error(reqDelErr.message);
  }

  if (quoteIds.length) {
    const { error: qiDelErr } = await supabase.from("quote_items").delete().in("quote_id", quoteIds);
    if (qiDelErr) throw new Error(qiDelErr.message);

    const { error: qDelErr } = await supabase.from("quotes").delete().in("id", quoteIds);
    if (qDelErr) throw new Error(qDelErr.message);
  }
}

async function insertRequest({ customerName, createdAt, services, overallStatus, createdBy }) {
  const statusByService = {
    scan_status: services.includes("3D Scanning")
      ? overallStatus === "Completed"
        ? "Completed"
        : overallStatus === "In Progress"
        ? "In Progress"
        : "Not Started"
      : "Not Started",
    design_status: services.includes("3D Design")
      ? overallStatus === "Completed"
        ? "Completed"
        : overallStatus === "In Progress"
        ? "In Progress"
        : "Not Started"
      : "Not Started",
    print_status: services.includes("Contract Print")
      ? overallStatus === "Completed"
        ? "Completed"
        : overallStatus === "In Progress"
        ? "In Progress"
        : "Not Started"
      : "Not Started",
  };

  const { data, error } = await supabase
    .from("requests")
    .insert({
      customer_name: customerName,
      project_details: `[MOCK] Synthetic workload for dashboards/reports (${new Date().toISOString()})`,
      services_requested: services,
      overall_status: overallStatus,
      created_at: createdAt,
      created_by: createdBy,
      ...statusByService,
    })
    .select("id, request_number")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function insertQuote({ customerName, jobName, requestId, services, rates, materialIds }) {
  const { data: quoteRow, error: quoteErr } = await supabase
    .from("quotes")
    .insert({ customer_name: customerName, job_name: jobName, notes: "[MOCK] Generated seed quote" })
    .select("id")
    .single();

  if (quoteErr) throw new Error(quoteErr.message);
  const quoteId = String(quoteRow.id);

  const quoteItems = [];

  for (const service of services) {
    const key = quoteKeyForServiceLabel(service);
    if (!key) continue;

    if (key === "CONTRACT_PRINTING") {
      const printTime = hours(rand(8, 72));
      const setup = hours(rand(0.5, 3));
      const support = hours(rand(1, 6));
      const admin = hours(rand(0.25, 1.5));
      const quotedInternal = hours(rand(350, 2800));

      quoteItems.push({
        quote_id: quoteId,
        service_type: key,
        labor_hours: 0,
        print_time_hours: printTime,
        params: {
          material1_id: materialIds[0] ?? null,
          material1_grams: randInt(200, 2500),
          material2_id: materialIds[1] ?? null,
          material2_grams: randInt(0, 800),
          support_removal_hours: support,
          setup_hours: setup,
          admin_hours: admin,
          calc: {
            V2_internalTotalCost: quotedInternal,
          },
        },
      });
    } else {
      const labor =
        key === "3D_SCANNING"
          ? hours(rand(2, 14))
          : key === "3D_DESIGN"
          ? hours(rand(3, 24))
          : hours(rand(1, 10));

      quoteItems.push({
        quote_id: quoteId,
        service_type: key,
        labor_hours: labor,
        print_time_hours: 0,
        params: {},
      });
    }
  }

  if (quoteItems.length) {
    const { error: qiErr } = await supabase.from("quote_items").insert(quoteItems);
    if (qiErr) throw new Error(qiErr.message);
  }

  const { error: linkErr } = await supabase.from("requests").update({ quote_id: quoteId }).eq("id", requestId);
  if (linkErr) throw new Error(linkErr.message);

  return quoteId;
}

function plannedHoursForService(serviceLabel, quoteItem) {
  const qk = quoteKeyForServiceLabel(serviceLabel);
  if (!qk || !quoteItem) return 0;

  if (qk === "CONTRACT_PRINTING") {
    const p = quoteItem.params ?? {};
    return (
      toNum(quoteItem.print_time_hours) +
      toNum(p.support_removal_hours) +
      toNum(p.setup_hours) +
      toNum(p.admin_hours)
    );
  }

  return toNum(quoteItem.labor_hours);
}

async function seed() {
  const rates = await loadCostSettings();
  const materialIds = await loadMaterialIds();
  const createdBy = await resolveMockOwnerId();

  console.log(`Using created_by user: ${createdBy}`);

  if (RESET) {
    console.log("Cleaning old mock records...");
    await cleanupMocks();
  }

  const now = Date.now();
  const customers = [
    "Apex Labs",
    "Nova Systems",
    "Blue Harbor",
    "Vertex Medical",
    "Helix Manufacturing",
    "Summit Robotics",
    "Riverton Design",
    "Orchid Aerospace",
    "Northline Tools",
    "Copperfield R&D",
  ];

  const scenarios = [
    { overall: "Completed", lateChance: 0.35, varianceBias: 1.15 },
    { overall: "Completed", lateChance: 0.20, varianceBias: 0.85 },
    { overall: "In Progress", lateChance: 0.45, varianceBias: 1.05 },
    { overall: "New", lateChance: 0.30, varianceBias: 1.0 },
  ];

  const totalRequests = 24;

  for (let i = 0; i < totalRequests; i++) {
    const scenario = scenarios[i % scenarios.length];
    const serviceCount = randInt(1, 3);
    const servicePool = [...SERVICE_LABELS];
    const services = [];
    while (services.length < serviceCount && servicePool.length) {
      const idx = randInt(0, servicePool.length - 1);
      services.push(servicePool.splice(idx, 1)[0]);
    }

    const createdAtMs = now - randInt(10, 240) * DAY_MS;
    const createdAt = new Date(createdAtMs).toISOString();
    const customerName = `${pick(customers)} ${i + 1}`;

    const req = await insertRequest({
      customerName,
      createdAt,
      services,
      overallStatus: scenario.overall,
      createdBy,
    });

    const requestId = String(req.id);
    const requestNum = Number(req.request_number);

    const quoteId = await insertQuote({
      customerName,
      jobName: `MOCK-${Number.isFinite(requestNum) ? String(requestNum).padStart(5, "0") : i + 1}`,
      requestId,
      services,
      rates,
      materialIds,
    });

    const { data: quoteItems } = await supabase
      .from("quote_items")
      .select("service_type,labor_hours,print_time_hours,params")
      .eq("quote_id", quoteId);

    const quoteByType = new Map((quoteItems ?? []).map((q) => [String(q.service_type), q]));

    const requestServices = services.map((service) => {
      let step_status = "Not Started";
      if (scenario.overall === "Completed") step_status = "Completed";
      if (scenario.overall === "In Progress") {
        if (service === services[0]) step_status = "In Progress";
        else if (Math.random() < 0.35) step_status = "Waiting";
      }

      const startedAtMs = createdAtMs + randInt(1, 20) * 60 * 60 * 1000;
      const completedAtMs = scenario.overall === "Completed" ? startedAtMs + randInt(4, 240) * 60 * 60 * 1000 : null;

      return {
        request_id: requestId,
        service_type: service,
        step_status,
        sort_order: serviceSortOrder(service),
        started_at: step_status === "Not Started" ? null : new Date(startedAtMs).toISOString(),
        paused_at: step_status === "Waiting" ? new Date(startedAtMs + 2 * 60 * 60 * 1000).toISOString() : null,
        completed_at: step_status === "Completed" ? new Date(completedAtMs).toISOString() : null,
      };
    });

    const { data: insertedSteps, error: stepErr } = await supabase
      .from("request_services")
      .insert(requestServices)
      .select("id, service_type, step_status, started_at, completed_at");

    if (stepErr) throw new Error(stepErr.message);

    let requestDueMaxMs = null;

    for (const step of insertedSteps ?? []) {
      const serviceType = String(step.service_type);
      const quoteKey = quoteKeyForServiceLabel(serviceType);
      const quoteItem = quoteKey ? quoteByType.get(quoteKey) : null;

      const plannedHours = plannedHoursForService(serviceType, quoteItem);
      const leadDays = leadDaysFromHours(plannedHours);

      const startedAtMs = step.started_at ? Date.parse(step.started_at) : createdAtMs;
      const baseDueMs = startedAtMs + leadDays * DAY_MS;
      const lateFlag = Math.random() < scenario.lateChance;

      let completedAtMs = step.completed_at ? Date.parse(step.completed_at) : NaN;
      if (Number.isFinite(completedAtMs)) {
        completedAtMs = lateFlag
          ? baseDueMs + randInt(1, 5) * DAY_MS
          : baseDueMs - randInt(1, 3) * DAY_MS;
      }

      const dueAtMs = Number.isFinite(completedAtMs)
        ? lateFlag
          ? completedAtMs - randInt(1, 2) * 60 * 60 * 1000
          : completedAtMs + randInt(2, 48) * 60 * 60 * 1000
        : baseDueMs - (Math.random() < 0.4 ? randInt(1, 6) * DAY_MS : -randInt(1, 6) * DAY_MS);

      requestDueMaxMs = requestDueMaxMs == null ? dueAtMs : Math.max(requestDueMaxMs, dueAtMs);

      const varianceFactor = rand(0.75, 1.35) * scenario.varianceBias;
      const actualHours = hours(plannedHours * varianceFactor);

      let actualInternal = 0;
      let quotedInternal = 0;

      if (quoteKey === "CONTRACT_PRINTING") {
        quotedInternal = toNum(quoteItem?.params?.calc?.V2_internalTotalCost, rand(400, 3200));
        actualInternal = hours(quotedInternal * rand(0.8, 1.35));
      } else if (quoteKey === "3D_SCANNING") {
        quotedInternal = hours(plannedHours * rates.scanningInternalRate);
        actualInternal = hours(actualHours * rates.scanningInternalRate);
      } else if (quoteKey === "3D_DESIGN") {
        quotedInternal = hours(plannedHours * rates.designInternalRate);
        actualInternal = hours(actualHours * rates.designInternalRate);
      } else {
        quotedInternal = hours(plannedHours * rates.testingInternalRate);
        actualInternal = hours(actualHours * rates.testingInternalRate);
      }

      const leadPayload = {
        quoted_hours: hours(plannedHours),
        lead_days: leadDays,
        queue_headroom_days: 2,
        starts_at: new Date(startedAtMs).toISOString(),
        due_at: new Date(dueAtMs).toISOString(),
        formula_version: "mock_seed_v1",
        calculated_at: new Date(now).toISOString(),
      };

      const data = {
        lead_time: leadPayload,
      };

      if (quoteKey === "CONTRACT_PRINTING") {
        data.contract_print = {
          calc_actual: {
            actual_print_time_hours: hours(actualHours * 0.8),
            actual_setup_hours: hours(actualHours * 0.1),
            actual_support_removal_hours: hours(actualHours * 0.1),
            V2_internalTotalCost: actualInternal,
          },
        };
      }

      const { error: actualErr } = await supabase.from("service_actuals").upsert(
        {
          service_id: step.id,
          actual_hours: quoteKey === "CONTRACT_PRINTING" ? null : actualHours,
          data,
        },
        { onConflict: "service_id" }
      );

      if (actualErr) throw new Error(actualErr.message);

      if (Number.isFinite(completedAtMs)) {
        const { error: completePatchErr } = await supabase
          .from("request_services")
          .update({ completed_at: new Date(completedAtMs).toISOString() })
          .eq("id", step.id);

        if (completePatchErr) throw new Error(completePatchErr.message);
      }
    }

    if (requestDueMaxMs != null) {
      const { error: dueErr } = await supabase
        .from("requests")
        .update({ job_deadline: new Date(requestDueMaxMs).toISOString() })
        .eq("id", requestId);

      if (dueErr) throw new Error(dueErr.message);
    }

    console.log(`Seeded request ${requestId} (${customerName}) with ${services.length} service(s)`);
  }
}

seed()
  .then(() => {
    console.log("Mock seed complete.");
    process.exit(0);
  })
  .catch((err) => {
    const msg = String(err?.message ?? err ?? "Unknown error");

    if (msg.includes("<!DOCTYPE html>") || msg.includes("<html")) {
      console.error(
        "Mock seed failed: Received HTML instead of Supabase API JSON. This usually means NEXT_PUBLIC_SUPABASE_URL is set to a dashboard/studio URL."
      );
      console.error("Use: https://<project-ref>.supabase.co");
      process.exit(1);
    }

    console.error("Mock seed failed:", msg);
    process.exit(1);
  });
