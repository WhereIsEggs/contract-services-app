import { createClient } from "@/app/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { notFound, redirect } from "next/navigation";

function msToHours(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return ms / (1000 * 60 * 60);
}

function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

type MaterialOption = {
  id: string;
  name: string;
  category: string | null;
  is_active: boolean;
  price_per_lb: number;
};

export default async function ServiceAdjustmentPage({
  params,
}: {
  params: Promise<{ id: string; serviceId: string }>;
}) {
  const { id, serviceId } = await params;
  if (!id || !serviceId) notFound();

  const supabase = await createClient();

  const { data: service, error } = await supabase
    .from("request_services")
    .select(
      `
        id,
        request_id,
        service_type,
        step_status,
        started_at,
        completed_at
      `
    )
    .eq("id", serviceId)
    .eq("request_id", id)
    .single();

  if (error || !service) notFound();

  const isContractPrint = service.service_type === "Contract Print";

  // Auto hours (basic: started -> completed). Pause subtraction comes later.
  const startedAt = service.started_at ? new Date(service.started_at).getTime() : null;
  const completedAt = service.completed_at ? new Date(service.completed_at).getTime() : null;
  const autoHours = startedAt && completedAt ? msToHours(completedAt - startedAt) : 0;

  // Load existing actuals if present
  const { data: actuals } = await supabase
    .from("service_actuals")
    .select("actual_hours, data")
    .eq("service_id", serviceId)
    .maybeSingle();

  const existingNonPrintHours =
    actuals?.actual_hours !== null && actuals?.actual_hours !== undefined
      ? Number(actuals.actual_hours)
      : autoHours;

  const existingNotes = (actuals?.data as any)?.notes ?? "";

  // For Contract Print: pull existing saved CP data (if any)
  const existingCP = (actuals?.data as any)?.contract_print ?? null;

  // If Contract Print, also load request -> quote -> quote_items baseline
  let quoteBaseline: any = null;
  let materials: MaterialOption[] = [];

  if (isContractPrint) {
    const { data: reqRow, error: reqErr } = await supabase
      .from("requests")
      .select("quote_id")
      .eq("id", id)
      .single();

    if (!reqErr && reqRow?.quote_id) {
      const quote_id = String(reqRow.quote_id);

      const { data: qi, error: qiErr } = await supabase
        .from("quote_items")
        .select("service_type, params, print_time_hours")
        .eq("quote_id", quote_id)
        .eq("service_type", "CONTRACT_PRINTING")
        .limit(1)
        .maybeSingle();

      if (!qiErr && qi) {
        quoteBaseline = {
          quote_id,
          print_time_hours: toNum((qi as any).print_time_hours),
          params: (qi as any).params ?? {},
        };
      }
    }

    // Load material options (for extra materials dropdowns)
    const { data: mats, error: matsErr } = await supabase
      .from("material_costs")
      .select("id,name,category,is_active,price_per_lb")
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (matsErr) throw new Error(matsErr.message);
    materials = (mats ?? []) as any;
  }

  // Helpers for quoted baseline display
  const qbParams = quoteBaseline?.params ?? {};
  const qbCalc = qbParams?.calc ?? null;

  const qb_material1_id = qbParams?.material1_id ?? null;
  const qb_material2_id = qbParams?.material2_id ?? null;
  const qb_material1_grams = toNum(qbParams?.material1_grams ?? 0);
  const qb_material2_grams = toNum(qbParams?.material2_grams ?? 0);

  const qb_setup_hours = toNum(qbParams?.setup_hours ?? 0);
  const qb_support_removal_hours = toNum(qbParams?.support_removal_hours ?? 0);
  const qb_admin_hours = toNum(qbParams?.admin_hours ?? 0);

  function materialLabel(id: string | null) {
    if (!id) return "—";
    const m = materials.find((x) => String(x.id) === String(id));
    return m ? `${m.name}${m.category ? ` (${m.category})` : ""}` : id;
  }

  // Existing CP saved defaults
  const cp_restarted = Boolean(existingCP?.restarted ?? false);
  const cp_extra_machine_hours = toNum(existingCP?.extra_machine_hours ?? 0);
  const cp_extra_setup_hours = toNum(existingCP?.extra_setup_hours ?? 0);
  const cp_extra_support_removal_hours = toNum(existingCP?.extra_support_removal_hours ?? 0);

  // Actual material usage (defaults to quoted baseline, but editable)
  const cp_material1_id = String(existingCP?.material1_id ?? qb_material1_id ?? "");
  const cp_material2_id = String(existingCP?.material2_id ?? qb_material2_id ?? "");

  const cp_material1_grams = toNum(
    existingCP?.material1_grams ?? (qb_material1_grams || 0)
  );
  const cp_material2_grams = toNum(
    existingCP?.material2_grams ?? (qb_material2_grams || 0)
  );

  const cp_notes = String(existingCP?.notes ?? "");
  return (
    <AppShell title="Post-Completion Adjustment" activeNav="in_progress">
      <div className="max-w-[900px] mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-neutral-100">
            {service.service_type} – Post Completion Adjustment
          </h2>
          <div className="mt-4 border-b border-neutral-800" />
        </div>

        <form
          action={async (formData: FormData) => {
            "use server";

            const supabase = await createClient();

            // Always allow notes at root for all services (optional)
            const notes_root = String(formData.get("notes_root") ?? "").trim();

            if (formData.get("mode") === "contract_print") {
              const restarted = formData.get("restarted") === "on";

              const extra_machine_hours = toNum(formData.get("extra_machine_hours"));
              const extra_setup_hours = toNum(formData.get("extra_setup_hours"));
              const extra_support_removal_hours = toNum(formData.get("extra_support_removal_hours"));

              // Actual material usage (editable)
              const material1_id = String(formData.get("material1_id") ?? "").trim() || null;
              const material2_id = String(formData.get("material2_id") ?? "").trim() || null;

              const material1_grams = toNum(formData.get("material1_grams"));
              const material2_grams = toNum(formData.get("material2_grams"));
              const notes = String(formData.get("cp_notes") ?? "").trim();

              // ---------- helpers ----------
              function gramsToPoundsCeil2dp(grams: number) {
                if (!Number.isFinite(grams) || grams <= 0) return 0;
                return Math.ceil(grams * 0.00220462 * 100) / 100; // ceil to 0.01 lb
              }
              function round2(n: number) {
                return Math.round((n + Number.EPSILON) * 100) / 100;
              }

              // ---------- load quote baseline again (server action safe) ----------
              const { data: reqRow, error: reqErr } = await supabase
                .from("requests")
                .select("quote_id")
                .eq("id", id)
                .single();

              const quote_id = reqRow?.quote_id ? String(reqRow.quote_id) : null;

              let baseline_print_time_hours = 0;
              let baseline_setup_hours = 0;
              let baseline_support_removal_hours = 0;

              if (quote_id) {
                const { data: qi } = await supabase
                  .from("quote_items")
                  .select("print_time_hours, params")
                  .eq("quote_id", quote_id)
                  .eq("service_type", "CONTRACT_PRINTING")
                  .maybeSingle();

                baseline_print_time_hours = toNum((qi as any)?.print_time_hours ?? 0);

                const p = (qi as any)?.params ?? {};
                baseline_setup_hours = toNum(p?.setup_hours ?? 0);
                baseline_support_removal_hours = toNum(p?.support_removal_hours ?? 0);
              }

              // ---------- cost settings ----------
              const { data: settingsRows, error: settingsErr } = await supabase
                .from("cost_settings")
                .select("key,value");

              if (settingsErr) throw new Error(settingsErr.message);

              const settings = new Map<string, number>(
                (settingsRows ?? []).map((r: any) => [String(r.key), Number(r.value)])
              );

              const getSetting = (key: string, fallback = 0) =>
                settings.has(key) ? (settings.get(key) as number) : fallback;

              const defaultFailureRate = getSetting("default_failure_rate", 0.65);

              const machineCostRate = getSetting("machine_cost_rate", 0);
              const electricityCostRate = getSetting("electricity_cost_rate", 0);
              const spaceConsumablesCostRate = getSetting("space_consumables_cost_rate", 0);

              const supportRemovalBillableRate = getSetting("support_removal_billable_rate", 0);
              const supportRemovalInternalRate = getSetting("support_removal_internal_rate", 0);

              const machineSetupBillableRate = getSetting("machine_setup_billable_rate", 0);
              const machineSetupInternalRate = getSetting("machine_setup_internal_rate", 0);

              // Admin removed from post-completion adjustment by design
              const monitoringTimePct = getSetting("monitoring_time_pct", 0);
              const monitoringBillableRate = getSetting("monitoring_billable_rate", 0);
              const monitoringInternalRate = getSetting("monitoring_internal_rate", 0);

              // ---------- material rates ----------
              const materialIds = [material1_id, material2_id].filter(Boolean) as string[];

              const { data: mats, error: matsErr } = materialIds.length
                ? await supabase
                  .from("material_costs")
                  .select("id,price_per_lb")
                  .in("id", materialIds)
                : { data: [], error: null as any };

              if (matsErr) throw new Error(matsErr.message);

              const rateById = new Map<string, number>(
                (mats ?? []).map((m: any) => [String(m.id), toNum(m.price_per_lb)])
              );

              const rate1 = material1_id ? rateById.get(material1_id) ?? 0 : 0;
              const rate2 = material2_id ? rateById.get(material2_id) ?? 0 : 0;

              // ---------- ACTUALS model ----------
              // Machine time: baseline print time + extra machine time
              const actual_print_time_hours = baseline_print_time_hours + extra_machine_hours;

              // Setup/support time: baseline + extras
              const actual_setup_hours = baseline_setup_hours + extra_setup_hours;
              const actual_support_removal_hours =
                baseline_support_removal_hours + extra_support_removal_hours;

              // Materials: use the selected actual grams
              const lbs1 = gramsToPoundsCeil2dp(material1_grams);
              const lbs2 = gramsToPoundsCeil2dp(material2_grams);

              // Costs (mirrors quote calc structure)
              const Q2_machineCost = actual_print_time_hours * machineCostRate;
              const R2_materialUseCost = (lbs1 * rate1 + lbs2 * rate2) * 1.65;
              const S2_elecSpaceCost =
                actual_print_time_hours * (electricityCostRate + spaceConsumablesCostRate);

              const T2_manufacturingCost = Q2_machineCost + R2_materialUseCost + S2_elecSpaceCost;

              const W2_laborFees_billable =
                actual_support_removal_hours * supportRemovalBillableRate +
                actual_setup_hours * machineSetupBillableRate +
                actual_print_time_hours * monitoringTimePct * monitoringBillableRate;

              const W2_laborCost_internal =
                actual_support_removal_hours * supportRemovalInternalRate +
                actual_setup_hours * machineSetupInternalRate +
                actual_print_time_hours * monitoringTimePct * monitoringInternalRate;

              const U2_withFailRate = T2_manufacturingCost * (1 + defaultFailureRate);
              const V2_internalTotalCost = U2_withFailRate + W2_laborCost_internal;

              const calc_actual = {
                lbs1: round2(lbs1),
                lbs2: round2(lbs2),
                rate1: round2(rate1),
                rate2: round2(rate2),
                defaultFailureRate: round2(defaultFailureRate),

                actual_print_time_hours: round2(actual_print_time_hours),
                actual_setup_hours: round2(actual_setup_hours),
                actual_support_removal_hours: round2(actual_support_removal_hours),

                Q2_machineCost: round2(Q2_machineCost),
                R2_materialUseCost: round2(R2_materialUseCost),
                S2_elecSpaceCost: round2(S2_elecSpaceCost),
                T2_manufacturingCost: round2(T2_manufacturingCost),
                W2_laborFees_billable: round2(W2_laborFees_billable),
                W2_laborCost_internal: round2(W2_laborCost_internal),
                U2_withFailRate: round2(U2_withFailRate),
                V2_internalTotalCost: round2(V2_internalTotalCost),
              };
              const payloadData = {
                ...(actuals?.data as any),
                notes: notes_root,
                contract_print: {
                  restarted,
                  extra_machine_hours,
                  extra_setup_hours,
                  extra_support_removal_hours,

                  material1_id,
                  material1_grams,
                  material2_id,
                  material2_grams,

                  calc_actual,
                  notes,
                },
              };

              const { error } = await supabase
                .from("service_actuals")
                .upsert(
                  {
                    service_id: serviceId,
                    actual_hours: null, // CP uses structured fields; we’ll compute totals later
                    data: payloadData,
                  },
                  { onConflict: "service_id" }
                );

              if (error) throw new Error(error.message);

              redirect(`/requests/${id}`);
            } else {
              // Non-print (simple hours)
              const actual_hours = toNum(formData.get("actual_hours"));

              const payloadData = {
                ...(actuals?.data as any),
                notes: notes_root || String(formData.get("notes") ?? "").trim(),
              };

              const { error } = await supabase
                .from("service_actuals")
                .upsert(
                  {
                    service_id: serviceId,
                    actual_hours,
                    data: payloadData,
                  },
                  { onConflict: "service_id" }
                );

              if (error) throw new Error(error.message);

              redirect(`/requests/${id}`);
            }
          }}
          className="bg-neutral-900 rounded-lg shadow-lg p-6 text-neutral-200"
        >
          {/* Root notes (optional) */}
          <div className="mb-6 grid gap-2">
            <label className="text-sm text-neutral-200">Notes (optional)</label>
            <textarea
              name="notes_root"
              rows={3}
              defaultValue={existingNotes}
              className="w-full rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-sm text-neutral-100"
              placeholder="General notes about this service completion..."
            />
          </div>

          {!isContractPrint ? (
            <>
              <input type="hidden" name="mode" value="non_print" />

              <div className="grid gap-4">
                <div className="text-sm text-neutral-400">
                  Auto-calculated from Started → Completed (pause subtraction coming next)
                </div>

                <div className="grid gap-2">
                  <label className="text-sm">Actual labor time (hours)</label>
                  <input
                    name="actual_hours"
                    defaultValue={existingNonPrintHours.toFixed(2)}
                    inputMode="decimal"
                    className="h-10 w-48 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 text-sm text-neutral-100"
                  />
                  <div className="text-xs text-neutral-500">
                    Auto-calculated: {autoHours.toFixed(2)} hours
                  </div>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm">Additional Notes</label>
                  <textarea
                    name="notes"
                    rows={4}
                    defaultValue={existingNotes}
                    className="w-full rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-sm text-neutral-100"
                    placeholder="Any adjustments, delays, rework details, etc."
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <input type="hidden" name="mode" value="contract_print" />

              {/* Baseline summary */}
              <div className="mb-6 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-3">
                <div className="text-sm font-medium text-neutral-100">Quoted Baseline</div>
                {quoteBaseline ? (
                  <div className="mt-2 grid gap-2 text-sm text-neutral-300">
                    <div>
                      Quoted print time hours:{" "}
                      <span className="text-neutral-100">
                        {toNum(quoteBaseline.print_time_hours).toFixed(2)}
                      </span>
                    </div>
                    <div>
                      Quoted setup / support / admin:{" "}
                      <span className="text-neutral-100">
                        {qb_setup_hours.toFixed(2)} / {qb_support_removal_hours.toFixed(2)} /{" "}
                        {qb_admin_hours.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      Quoted materials:
                      <div className="mt-1 text-neutral-100">
                        • {materialLabel(qb_material1_id)} — {qb_material1_grams} g
                      </div>
                      <div className="text-neutral-100">
                        • {materialLabel(qb_material2_id)} — {qb_material2_grams} g
                      </div>
                    </div>

                    {qbCalc ? (
                      <div className="mt-2 text-xs text-neutral-500">
                        Snapshot calc present (e.g. internal total, labor billable/internal, etc.)
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-amber-200">
                    No linked quote baseline found for this request.
                  </div>
                )}
              </div>

              {/* Contract Print actuals inputs */}
              <div className="grid gap-4">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" name="restarted" defaultChecked={cp_restarted} />
                  Was it restarted?
                </label>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <label className="text-sm">Extra machine time (hours)</label>
                    <input
                      name="extra_machine_hours"
                      defaultValue={cp_extra_machine_hours.toFixed(2)}
                      inputMode="decimal"
                      className="h-10 w-full rounded-md border border-neutral-800 bg-neutral-950/40 px-3 text-sm text-neutral-100"
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm">Extra setup time (hours)</label>
                    <input
                      name="extra_setup_hours"
                      defaultValue={cp_extra_setup_hours.toFixed(2)}
                      inputMode="decimal"
                      className="h-10 w-full rounded-md border border-neutral-800 bg-neutral-950/40 px-3 text-sm text-neutral-100"
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm">Extra support removal (hours)</label>
                    <input
                      name="extra_support_removal_hours"
                      defaultValue={cp_extra_support_removal_hours.toFixed(2)}
                      inputMode="decimal"
                      className="h-10 w-full rounded-md border border-neutral-800 bg-neutral-950/40 px-3 text-sm text-neutral-100"
                    />
                  </div>
                </div>

                {/* Extra materials (2 rows for now) */}
                <div className="mt-2">
                  <div className="mt-2">
                    <div className="text-sm font-medium text-neutral-100">Material usage</div>
                    <div className="mt-2 grid gap-3">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px]">
                        <select
                          name="material1_id"
                          defaultValue={cp_material1_id}
                          className="h-10 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 text-sm text-neutral-100"
                        >
                          <option value="">Select material…</option>
                          {materials.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.category ? `${m.category} — ` : ""}
                              {m.name}
                              {!m.is_active ? " (inactive)" : ""}
                            </option>
                          ))}
                        </select>

                        <input
                          name="material1_grams"
                          defaultValue={String(cp_material1_grams)}
                          inputMode="numeric"
                          className="h-10 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 text-sm text-neutral-100"
                          placeholder="grams"
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px]">
                        <select
                          name="material2_id"
                          defaultValue={cp_material2_id}
                          className="h-10 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 text-sm text-neutral-100"
                        >
                          <option value="">Select material…</option>
                          {materials.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.category ? `${m.category} — ` : ""}
                              {m.name}
                              {!m.is_active ? " (inactive)" : ""}
                            </option>
                          ))}
                        </select>

                        <input
                          name="material2_grams"
                          defaultValue={String(cp_material2_grams)}
                          inputMode="numeric"
                          className="h-10 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 text-sm text-neutral-100"
                          placeholder="grams"
                        />
                      </div>

                      <div className="text-xs text-neutral-500">
                        Defaults to the quoted materials, but you can change it to what was actually used.
                      </div>
                    </div>
                  </div>                  <div className="mt-2 grid gap-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px]">
                      <select
                        name="extra_material1_id"
                        defaultValue={String(cp_row1.material_id ?? "")}
                        className="h-10 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 text-sm text-neutral-100"
                      >
                        <option value="">Select material…</option>
                        {materials.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.category ? `${m.category} — ` : ""}
                            {m.name}
                            {!m.is_active ? " (inactive)" : ""}
                          </option>
                        ))}
                      </select>

                      <input
                        name="extra_material1_grams"
                        defaultValue={toNum(cp_row1.grams).toString()}
                        inputMode="numeric"
                        className="h-10 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 text-sm text-neutral-100"
                        placeholder="grams"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px]">
                      <select
                        name="extra_material2_id"
                        defaultValue={String(cp_row2.material_id ?? "")}
                        className="h-10 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 text-sm text-neutral-100"
                      >
                        <option value="">Select material…</option>
                        {materials.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.category ? `${m.category} — ` : ""}
                            {m.name}
                            {!m.is_active ? " (inactive)" : ""}
                          </option>
                        ))}
                      </select>

                      <input
                        name="extra_material2_grams"
                        defaultValue={toNum(cp_row2.grams).toString()}
                        inputMode="numeric"
                        className="h-10 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 text-sm text-neutral-100"
                        placeholder="grams"
                      />
                    </div>

                    <div className="text-xs text-neutral-500">
                      (We’ll make this truly dynamic/add-row later. Two rows is enough to start.)
                    </div>
                  </div>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm">Failure / restart notes</label>
                  <textarea
                    name="cp_notes"
                    rows={4}
                    defaultValue={cp_notes}
                    className="w-full rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-sm text-neutral-100"
                    placeholder="Describe restarts, failures, extra runs, etc."
                  />
                </div>
              </div>
            </>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="submit"
              className="h-10 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Save Actuals
            </button>

            <a
              href={`/requests/${id}`}
              className="h-10 inline-flex items-center rounded-md border border-neutral-700 px-4 text-sm text-neutral-300"
            >
              Cancel
            </a>
          </div>
        </form>
      </div>
    </AppShell>
  );
}