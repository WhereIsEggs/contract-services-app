import { createClient } from "@/app/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { notFound, redirect } from "next/navigation";
import ContractPrintAdjustClient from "./ContractPrintAdjustClient";

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
  const existingCP = (actuals?.data as any)?.contract_print ?? null;

  // If Contract Print, load request -> quote -> quote_items baseline + material options
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

  function materialLabel(mid: string | null) {
    if (!mid) return "—";
    const m = materials.find((x) => String(x.id) === String(mid));
    return m ? `${m.name}${m.category ? ` (${m.category})` : ""}` : mid;
  }

  function hasResolvedMaterial(mid: string | null) {
    if (!mid) return false;
    return materials.some((x) => String(x.id) === String(mid));
  }

  // Existing CP saved defaults
  const cp_restarted = Boolean(existingCP?.restarted ?? false);
  const cp_extra_machine_hours = toNum(existingCP?.extra_machine_hours ?? 0);
  const cp_extra_setup_hours = toNum(existingCP?.extra_setup_hours ?? 0);
  const cp_extra_support_removal_hours = toNum(existingCP?.extra_support_removal_hours ?? 0);

  // Extra material usage (NOT total).
  // Default behavior:
  // - If restarted is checked AND there are no saved extra materials yet -> prefill IDs from quoted baseline materials
  // - Otherwise -> use saved values (or blank)
  const cp_extra_material1_id = String(
    existingCP?.extra_material1_id ??
    (cp_restarted ? (qb_material1_id ?? "") : "")
  );

  const cp_extra_material2_id = String(
    existingCP?.extra_material2_id ??
    (cp_restarted ? (qb_material2_id ?? "") : "")
  );

  const cp_extra_material1_grams = toNum(existingCP?.extra_material1_grams ?? 0);
  const cp_extra_material2_grams = toNum(existingCP?.extra_material2_grams ?? 0);
  const cp_notes = String(existingCP?.notes ?? "");

  return (
    <AppShell title="Post-Completion Adjustment" activeNav="in_progress">
      <div className="max-w-[900px] mx-auto">
        <div className="mb-6">
          <div className="mt-4 border-b border-neutral-800" />
        </div>

        <form
          action={async (formData: FormData) => {
            "use server";

            const supabase = await createClient();

            const notes_root = String(formData.get("notes_root") ?? "").trim();

            // ---------- helpers ----------
            function gramsToPoundsCeil2dp(grams: number) {
              if (!Number.isFinite(grams) || grams <= 0) return 0;
              return Math.ceil(grams * 0.00220462 * 100) / 100; // ceil to 0.01 lb
            }
            function round2(n: number) {
              return Math.round((n + Number.EPSILON) * 100) / 100;
            }

            if (formData.get("mode") === "contract_print") {
              const restarted = formData.get("restarted") === "on";

              const extra_machine_hours = toNum(formData.get("extra_machine_hours"));
              const extra_setup_hours = toNum(formData.get("extra_setup_hours"));
              const extra_support_removal_hours = toNum(formData.get("extra_support_removal_hours"));

              const extra_material1_id =
                String(formData.get("extra_material1_id") ?? "").trim() || null;
              const extra_material2_id =
                String(formData.get("extra_material2_id") ?? "").trim() || null;

              const extra_material1_grams = toNum(formData.get("extra_material1_grams"));
              const extra_material2_grams = toNum(formData.get("extra_material2_grams"));

              const notes = String(formData.get("cp_notes") ?? "").trim();

              // ---------- load quote baseline again (server action safe) ----------
              const { data: reqRow, error: reqErr } = await supabase
                .from("requests")
                .select("quote_id")
                .eq("id", id)
                .single();

              if (reqErr) throw new Error(reqErr.message);

              const quote_id = reqRow?.quote_id ? String(reqRow.quote_id) : null;

              // Baseline time
              let baseline_print_time_hours = 0;
              let baseline_setup_hours = 0;
              let baseline_support_removal_hours = 0;

              // Baseline materials (from quote)
              let baseline_material1_id: string | null = null;
              let baseline_material2_id: string | null = null;
              let baseline_material1_grams = 0;
              let baseline_material2_grams = 0;

              // Keep the quote item in scope so we can read params.calc later
              let qi: any = null;

              if (quote_id) {
                const { data, error: qiErr } = await supabase
                  .from("quote_items")
                  .select("print_time_hours, params")
                  .eq("quote_id", quote_id)
                  .eq("service_type", "CONTRACT_PRINTING")
                  .maybeSingle();

                if (qiErr) throw new Error(qiErr.message);

                qi = data;

                baseline_print_time_hours = toNum((qi as any)?.print_time_hours ?? 0);

                const p = (qi as any)?.params ?? {};
                baseline_setup_hours = toNum(p?.setup_hours ?? 0);
                baseline_support_removal_hours = toNum(p?.support_removal_hours ?? 0);

                baseline_material1_id = p?.material1_id ? String(p.material1_id) : null;
                baseline_material2_id = p?.material2_id ? String(p.material2_id) : null;

                baseline_material1_grams = toNum(p?.material1_grams ?? 0);
                baseline_material2_grams = toNum(p?.material2_grams ?? 0);
              }
              // Total material usage used for cost calc (baseline + extra grams)
              // IMPORTANT: we treat "extra" grams as additive to the quoted baseline.
              const total_material1_id = baseline_material1_id;
              const total_material2_id = baseline_material2_id;

              const total_material1_grams = baseline_material1_grams + extra_material1_grams;
              const total_material2_grams = baseline_material2_grams + extra_material2_grams;

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
              const materialIds = [total_material1_id, total_material2_id].filter(
                Boolean
              ) as string[];

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

              const rate1 = total_material1_id ? rateById.get(total_material1_id) ?? 0 : 0;
              const rate2 = total_material2_id ? rateById.get(total_material2_id) ?? 0 : 0;

              // ---------- ACTUALS model ----------
              // Goal:
              // - "Quoted internal" stays what it was at quote time (params.calc.V2_internalTotalCost)
              // - "Actual total internal" = quoted_internal + extra_internal
              // - extra_internal uses the SAME internal formula, applied ONLY to extras, and NO 1.65 markup.

              // Totals (baseline + extra) — still useful for display/audit
              const actual_print_time_hours = baseline_print_time_hours + extra_machine_hours;
              const actual_setup_hours = baseline_setup_hours + extra_setup_hours;
              const actual_support_removal_hours =
                baseline_support_removal_hours + extra_support_removal_hours;

              const lbs1 = gramsToPoundsCeil2dp(total_material1_grams);
              const lbs2 = gramsToPoundsCeil2dp(total_material2_grams);

              // Pull quoted baseline internal from the quote snapshot
              // (If missing for some reason, fall back to 0 to avoid crashing.)
              const baseline_internal_cost = toNum((qi as any)?.params?.calc?.V2_internalTotalCost ?? 0);

              // Extra-only inputs
              const extra_print_time_hours = extra_machine_hours; // extra machine time == extra print time
              const extra_setup_time_hours = extra_setup_hours;
              const extra_support_removal_time_hours = extra_support_removal_hours;

              const extra_lbs1 = gramsToPoundsCeil2dp(extra_material1_grams);
              const extra_lbs2 = gramsToPoundsCeil2dp(extra_material2_grams);

              // Extra INTERNAL manufacturing costs (NO markup)
              const Q2_machineCost_extra = extra_print_time_hours * machineCostRate;
              const R2_materialUseCost_internal_extra = (extra_lbs1 * rate1 + extra_lbs2 * rate2);
              const S2_elecSpaceCost_extra =
                extra_print_time_hours * (electricityCostRate + spaceConsumablesCostRate);

              const T2_manufacturingCost_internal_extra =
                Q2_machineCost_extra + R2_materialUseCost_internal_extra + S2_elecSpaceCost_extra;

              const U2_withFailRate_internal_extra =
                T2_manufacturingCost_internal_extra * (1 + defaultFailureRate);

              // Extra INTERNAL labor costs
              const W2_laborCost_internal_extra =
                extra_support_removal_time_hours * supportRemovalInternalRate +
                extra_setup_time_hours * machineSetupInternalRate +
                extra_print_time_hours * monitoringTimePct * monitoringInternalRate;

              const extra_internal_cost = U2_withFailRate_internal_extra + W2_laborCost_internal_extra;

              // Final number for the Completed page "Actual" section
              const V2_internalTotalCost = baseline_internal_cost + extra_internal_cost;

              // Keep billable labor totals for reference/audit (even if you don't display them)
              const W2_laborFees_billable =
                actual_support_removal_hours * supportRemovalBillableRate +
                actual_setup_hours * machineSetupBillableRate +
                actual_print_time_hours * monitoringTimePct * monitoringBillableRate;

              const calc_actual = {
                // totals (baseline + extra) for audit/display
                lbs1: round2(lbs1),
                lbs2: round2(lbs2),
                rate1: round2(rate1),
                rate2: round2(rate2),
                defaultFailureRate: round2(defaultFailureRate),

                baseline_print_time_hours: round2(baseline_print_time_hours),
                baseline_setup_hours: round2(baseline_setup_hours),
                baseline_support_removal_hours: round2(baseline_support_removal_hours),

                actual_print_time_hours: round2(actual_print_time_hours),
                actual_setup_hours: round2(actual_setup_hours),
                actual_support_removal_hours: round2(actual_support_removal_hours),

                // baseline + extra composition
                baseline_internal_cost: round2(baseline_internal_cost),

                extra_print_time_hours: round2(extra_print_time_hours),
                extra_setup_time_hours: round2(extra_setup_time_hours),
                extra_support_removal_time_hours: round2(extra_support_removal_time_hours),
                extra_lbs1: round2(extra_lbs1),
                extra_lbs2: round2(extra_lbs2),

                // extra internal breakdown (NO markup)
                Q2_machineCost_extra: round2(Q2_machineCost_extra),
                R2_materialUseCost_internal_extra: round2(R2_materialUseCost_internal_extra),
                S2_elecSpaceCost_extra: round2(S2_elecSpaceCost_extra),
                T2_manufacturingCost_internal_extra: round2(T2_manufacturingCost_internal_extra),
                U2_withFailRate_internal_extra: round2(U2_withFailRate_internal_extra),
                W2_laborCost_internal_extra: round2(W2_laborCost_internal_extra),
                extra_internal_cost: round2(extra_internal_cost),

                // optional billable reference
                W2_laborFees_billable: round2(W2_laborFees_billable),

                // FINAL
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

                  // Extra-only materials
                  extra_material1_id,
                  extra_material1_grams,
                  extra_material2_id,
                  extra_material2_grams,

                  // Baseline (quoted) materials (for display + audit)
                  baseline_material1_id,
                  baseline_material1_grams,
                  baseline_material2_id,
                  baseline_material2_grams,

                  // Totals (baseline + extra) used for cost calc and later profit/loss
                  total_material1_id,
                  total_material1_grams,
                  total_material2_id,
                  total_material2_grams,

                  calc_actual,
                  notes,
                },
              };

              const { error } = await supabase.from("service_actuals").upsert(
                {
                  service_id: serviceId,
                  actual_hours: null, // CP uses structured fields
                  data: payloadData,
                },
                { onConflict: "service_id" }
              );

              if (error) throw new Error(error.message);

              redirect(`/requests/${id}`);
            }

            // ---------- Non-print (simple hours) ----------
            const actual_hours = toNum(formData.get("actual_hours"));

            const payloadData = {
              ...(actuals?.data as any),
              notes: notes_root || String(formData.get("notes") ?? "").trim(),
            };

            const { error } = await supabase.from("service_actuals").upsert(
              {
                service_id: serviceId,
                actual_hours,
                data: payloadData,
              },
              { onConflict: "service_id" }
            );

            if (error) throw new Error(error.message);

            redirect(`/requests/${id}`);
          }}
          className="bg-neutral-900 rounded-lg shadow-lg p-6 text-neutral-200"
        >
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
                      Print time:{" "}
                      <span className="text-neutral-100">
                        {toNum(quoteBaseline.print_time_hours).toFixed(2)}
                      </span>
                    </div>

                    {/* Split setup/support/admin onto separate lines */}
                    <div>
                      Setup time:{" "}
                      <span className="text-neutral-100">{qb_setup_hours.toFixed(2)}</span>
                    </div>
                    <div>
                      Support removal time:{" "}
                      <span className="text-neutral-100">
                        {qb_support_removal_hours.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      Admin time:{" "}
                      <span className="text-neutral-100">{qb_admin_hours.toFixed(2)}</span>
                    </div>

                    <div>
                      {[
                        {
                          id: qb_material1_id,
                          grams: qb_material1_grams,
                        },
                        {
                          id: qb_material2_id,
                          grams: qb_material2_grams,
                        },
                      ].filter((m) => m.grams > 0 && hasResolvedMaterial(m.id)).length > 0 ? (
                        <>
                          Materials:
                          {[
                            {
                              id: qb_material1_id,
                              grams: qb_material1_grams,
                            },
                            {
                              id: qb_material2_id,
                              grams: qb_material2_grams,
                            },
                          ]
                            .filter((m) => m.grams > 0 && hasResolvedMaterial(m.id))
                            .map((m) => (
                              <div key={String(m.id)} className="mt-1 text-neutral-100">
                                • {materialLabel(m.id)} - {m.grams} g
                              </div>
                            ))}
                        </>
                      ) : null}
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

              <ContractPrintAdjustClient
                materials={materials}
                qb_material1_id={qb_material1_id}
                qb_material2_id={qb_material2_id}
                initialRestarted={cp_restarted}
                initialExtraMachineHours={cp_extra_machine_hours.toFixed(2)}
                initialExtraSetupHours={cp_extra_setup_hours.toFixed(2)}
                initialExtraSupportRemovalHours={cp_extra_support_removal_hours.toFixed(2)}
                initialExtraMaterial1Id={cp_extra_material1_id}
                initialExtraMaterial2Id={cp_extra_material2_id}
                initialExtraMaterial1Grams={String(cp_extra_material1_grams)}
                initialExtraMaterial2Grams={String(cp_extra_material2_grams)}
                initialNotes={cp_notes}
              />            </>
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