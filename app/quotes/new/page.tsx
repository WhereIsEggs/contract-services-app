// app/quotes/new/page.tsx

import AppShell from "@/app/components/AppShell";
import { createClient } from "@/app/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import QuoteFormClient from "./QuoteFormClient";

export default async function NewQuotePage({
    searchParams,
}: {
    searchParams?: Promise<{ msg?: string; err?: string; fromRequest?: string }>;
}) {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const sp = await searchParams;
    const fromRequest = String(sp?.fromRequest ?? "").trim();

    let initialSvc = {
        contract_printing: true,
        scanning: false,
        design: false,
        testing: false,
    };

    let initialCustomerName: string | undefined = undefined;
    let initialJobName: string | undefined = undefined;

    if (fromRequest) {
        const { data: existingReq, error: existingReqErr } = await supabase
            .from("requests")
            .select("id, quote_id, customer_name, request_number")
            .eq("id", fromRequest)
            .single();

        // If request not found, bounce back to request detail page
        if (existingReqErr || !existingReq) {
            redirect(`/requests/${fromRequest}`);
        }

        // If request already has a quote linked, bounce back to request detail page
        if (existingReq.quote_id) {
            redirect(`/requests/${fromRequest}`);
        }

        // Job name becomes the 5-digit Request Number (00001, 00002, etc.)
        const n = Number(existingReq.request_number);
        const padded = Number.isFinite(n)
            ? String(n).padStart(5, "0")
            : fromRequest.slice(0, 8);
        initialJobName = padded;

        if (existingReq.customer_name) {
            initialCustomerName = String(existingReq.customer_name);
        }

        // Preselect services based on request_services rows (if present)
        const { data: rows, error: svcErr } = await supabase
            .from("request_services")
            .select("service_type")
            .eq("request_id", fromRequest);

        if (!svcErr && rows && rows.length > 0) {
            initialSvc = {
                contract_printing: false,
                scanning: false,
                design: false,
                testing: false,
            };

            for (const r of rows) {
                const t = String((r as any)?.service_type ?? "").trim();

                if (t === "Contract Print" || t === "Contract Printing")
                    initialSvc.contract_printing = true;
                if (t === "3D Scanning") initialSvc.scanning = true;
                if (t === "3D Design") initialSvc.design = true;
                if (t === "Material Testing") initialSvc.testing = true;
            }
        }
    }

    const { data: materials, error } = await supabase
        .from("material_costs")
        .select("id,name,category,is_active")
        .eq("is_active", true)
        .order("category", { ascending: true })
        .order("name", { ascending: true });

    return (
        <AppShell title="New Quote">
            <div className="mx-auto w-full max-w-3xl">
                <div className="mb-6">
                    <h1 className="text-2xl font-semibold">New Quote</h1>
                    <p className="mt-1 text-sm text-neutral-400">
                        Skeleton quote entry (store inputs now; pricing logic later). Supports
                        multiple services via line items.
                    </p>
                </div>

                {sp?.msg && (
                    <div className="mb-6 rounded-md border border-emerald-900/40 bg-emerald-950/20 p-3 text-sm text-emerald-200">
                        {sp.msg}
                    </div>
                )}
                {sp?.err && (
                    <div className="mb-6 rounded-md border border-red-900/40 bg-red-950/20 p-3 text-sm text-red-200">
                        {sp.err}
                    </div>
                )}

                {error && (
                    <div className="mb-6 rounded-md border border-red-900/40 bg-red-950/20 p-3 text-sm text-red-200">
                        <div className="font-medium">Supabase error</div>
                        <div className="mt-1 whitespace-pre-wrap text-red-200/90">
                            {error.message}
                        </div>
                    </div>
                )}

                <QuoteFormClient
                    materials={(materials ?? []) as any}
                    action={createQuote}
                    initialSvc={initialSvc}
                    fromRequest={fromRequest}
                    initialCustomerName={initialCustomerName}
                    initialJobName={initialJobName}
                />
            </div>
        </AppShell>
    );
}

function gramsToPoundsCeil2dp(grams: number) {
    if (!Number.isFinite(grams) || grams <= 0) return 0;
    // match your sheet/script behavior: ceil to 0.01 lb
    return Math.ceil(grams * 0.00220462 * 100) / 100;
}

function toNum(v: any) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function round2(n: number) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

/* =========================
   Server Action
========================= */

async function createQuote(formData: FormData) {
    "use server";
    const supabase = await createClient();

    try {
        const customer_name = String(formData.get("customer_name") ?? "").trim();
        const job_name = String(formData.get("job_name") ?? "").trim();
        const from_request_id =
            String(formData.get("from_request_id") ?? "").trim() || null;
        const notes_raw = String(formData.get("notes") ?? "").trim();

        if (!customer_name) throw new Error("Customer name is required.");
        if (!job_name) throw new Error("Job name is required.");

        // Service toggles (coming from your hidden inputs)
        const svc_contract_printing = formData.get("svc_contract_printing") === "on";
        const svc_3d_scanning = formData.get("svc_3d_scanning") === "on";
        const svc_3d_design = formData.get("svc_3d_design") === "on";
        const svc_material_testing = formData.get("svc_material_testing") === "on";

        if (
            !svc_contract_printing &&
            !svc_3d_scanning &&
            !svc_3d_design &&
            !svc_material_testing
        ) {
            throw new Error("Select at least one service to quote.");
        }

        // Contract Printing inputs
        const print_time_hours = Number(
            String(formData.get("print_time_hours") ?? "0").trim()
        );
        const material1_id_raw = String(formData.get("material1_id") ?? "").trim();
        const material1_grams = Number(
            String(formData.get("material1_grams") ?? "0").trim()
        );
        const material2_id_raw = String(formData.get("material2_id") ?? "").trim();
        const material2_grams = Number(
            String(formData.get("material2_grams") ?? "0").trim()
        );

        if (!Number.isFinite(print_time_hours) || print_time_hours < 0)
            throw new Error("Invalid print time.");
        if (!Number.isFinite(material1_grams) || material1_grams < 0)
            throw new Error("Invalid material 1 grams.");
        if (!Number.isFinite(material2_grams) || material2_grams < 0)
            throw new Error("Invalid material 2 grams.");

        const material1_id = material1_id_raw.length ? material1_id_raw : null;
        const material2_id = material2_id_raw.length ? material2_id_raw : null;

        if (material1_grams > 0 && !material1_id)
            throw new Error("Select Material 1 if grams > 0.");
        if (material2_grams > 0 && !material2_id)
            throw new Error("Select Material 2 if grams > 0.");

        // Other services labor hours
        const scan_labor_hours = Number(
            String(formData.get("scan_labor_hours") ?? "0").trim()
        );
        const design_labor_hours = Number(
            String(formData.get("design_labor_hours") ?? "0").trim()
        );
        const test_labor_hours = Number(
            String(formData.get("test_labor_hours") ?? "0").trim()
        );

        if (!Number.isFinite(scan_labor_hours) || scan_labor_hours < 0)
            throw new Error("Invalid scanning labor hours.");
        if (!Number.isFinite(design_labor_hours) || design_labor_hours < 0)
            throw new Error("Invalid design labor hours.");
        if (!Number.isFinite(test_labor_hours) || test_labor_hours < 0)
            throw new Error("Invalid testing labor hours.");

        // =========================
        // Cost settings (Variables equivalents)
        // =========================
        const { data: settingsRows, error: settingsErr } = await supabase
            .from("cost_settings")
            .select("key,value");

        if (settingsErr) throw new Error(settingsErr.message);

        const settings = new Map<string, number>(
            (settingsRows ?? []).map((r: any) => [String(r.key), toNum(r.value)])
        );

        const getSetting = (key: string, fallback = 0) =>
            settings.has(key) ? (settings.get(key) as number) : fallback;

        // Defaults (no UI dropdowns)
        const defaultFailureRate = getSetting("default_failure_rate", 0.65); // I2

        // Rates used in your formulas
        const machineCostRate = getSetting("machine_cost_rate", 0); // D9
        const electricityCostRate = getSetting("electricity_cost_rate", 0); // D10
        const spaceConsumablesCostRate = getSetting(
            "space_consumables_cost_rate",
            0
        ); // D11

        const supportRemovalCostRate = getSetting("support_removal_cost_rate", 0); // D12
        const machineSetupCostRate = getSetting("machine_setup_cost_rate", 0); // D13
        const adminFeesCostRate = getSetting("admin_fees_cost_rate", 0); // D15

        const monitoringTimePct = getSetting("monitoring_time_pct", 0); // D16
        const monitoringTimeCostRate = getSetting("monitoring_time_cost_rate", 0); // D17

        const internalToExternalLaborRatio = getSetting(
            "internal_to_external_labor_ratio",
            0
        ); // D21

        // =========================
        // 1) Insert quote header
        // =========================
        const { data: quoteRow, error: quoteErr } = await supabase
            .from("quotes")
            .insert({
                customer_name,
                job_name,
                notes: notes_raw.length ? notes_raw : null,
            })
            .select("id")
            .single();

        if (quoteErr) throw new Error(quoteErr.message);

        const quote_id = quoteRow.id as string;

        // Link quote to request (if coming from request)
        if (from_request_id) {
            const { error: linkErr } = await supabase
                .from("requests")
                .update({ quote_id })
                .eq("id", from_request_id);

            if (linkErr) throw new Error(linkErr.message);
        }

        // =========================
        // Contract Printing calc (Q/R/S/T/U/W/V)
        // =========================
        let roundedContractCalc: any = null;

        if (svc_contract_printing) {
            // lbs (ceil to 0.01)
            const lbs1 = gramsToPoundsCeil2dp(material1_grams);
            const lbs2 = gramsToPoundsCeil2dp(material2_grams);

            // Material $/lb lookups (by id)
            const materialIds = [material1_id, material2_id].filter(
                Boolean
            ) as string[];

            const { data: mats, error: matsErr } = await supabase
                .from("material_costs")
                .select("id,price_per_lb")
                .in("id", materialIds);

            if (matsErr) throw new Error(matsErr.message);

            const rateById = new Map<string, number>(
                (mats ?? []).map((m: any) => [String(m.id), toNum(m.price_per_lb)])
            );

            const rate1 = material1_id ? rateById.get(material1_id) ?? 0 : 0;
            const rate2 = material2_id ? rateById.get(material2_id) ?? 0 : 0;

            // Q2 = D2 * machineCostRate
            const Q2_machineCost = print_time_hours * machineCostRate;

            // R2 = (lbs1*rate1 + lbs2*rate2) * 1.65
            const R2_materialUseCost = (lbs1 * rate1 + lbs2 * rate2) * 1.65;

            // S2 = D2*(electricity + space/consumables)
            const S2_elecSpaceCost =
                print_time_hours * (electricityCostRate + spaceConsumablesCostRate);

            // T2 = Q2 + R2 + S2
            const T2_manufacturingCost =
                Q2_machineCost + R2_materialUseCost + S2_elecSpaceCost;

            // W2 (labor fees) — you’re not collecting J/K/L yet, so default to 0 for now
            const J2_supportRemovalTime = 0;
            const K2_setupTime = 0;
            const L2_adminTime = 0;

            const W2_laborFees =
                J2_supportRemovalTime * supportRemovalCostRate +
                K2_setupTime * machineSetupCostRate +
                L2_adminTime * adminFeesCostRate +
                print_time_hours * monitoringTimePct * monitoringTimeCostRate;

            // U2 = T2*(1+failureRate)
            const U2_withFailRate = T2_manufacturingCost * (1 + defaultFailureRate);

            // V2 = U2 + (W2 * internalToExternalLaborRatio)
            const V2_totalWithExternalLabor =
                U2_withFailRate + W2_laborFees * internalToExternalLaborRatio;

            roundedContractCalc = {
                // inputs / lookups
                lbs1: round2(lbs1),
                lbs2: round2(lbs2),
                rate1: round2(rate1),
                rate2: round2(rate2),

                defaultFailureRate: round2(defaultFailureRate),
                internalToExternalLaborRatio: round2(internalToExternalLaborRatio),

                // calc pieces
                Q2_machineCost: round2(Q2_machineCost),
                R2_materialUseCost: round2(R2_materialUseCost),
                S2_elecSpaceCost: round2(S2_elecSpaceCost),
                T2_manufacturingCost: round2(T2_manufacturingCost),
                W2_laborFees: round2(W2_laborFees),
                U2_withFailRate: round2(U2_withFailRate),
                V2_totalWithExternalLabor: round2(V2_totalWithExternalLabor),
            };
        }

        // =========================
        // 2) Insert quote items
        // =========================
        const items: any[] = [];

        if (svc_contract_printing) {
            items.push({
                quote_id,
                service_type: "CONTRACT_PRINTING",
                labor_hours: 0,
                print_time_hours,
                params: {
                    material1_id,
                    material1_grams,
                    material2_id,
                    material2_grams,
                    calc: roundedContractCalc,
                },
            });
        }

        if (svc_3d_scanning) {
            items.push({
                quote_id,
                service_type: "3D_SCANNING",
                labor_hours: scan_labor_hours,
                print_time_hours: 0,
                params: {},
            });
        }

        if (svc_3d_design) {
            items.push({
                quote_id,
                service_type: "3D_DESIGN",
                labor_hours: design_labor_hours,
                print_time_hours: 0,
                params: {},
            });
        }

        if (svc_material_testing) {
            items.push({
                quote_id,
                service_type: "MATERIAL_TESTING",
                labor_hours: test_labor_hours,
                print_time_hours: 0,
                params: {},
            });
        }

        const { error: itemsErr } = await supabase.from("quote_items").insert(items);
        if (itemsErr) throw new Error(itemsErr.message);

        // Done
        revalidatePath("/quotes/new");
        if (from_request_id) redirect(`/requests/${from_request_id}`);
        redirect("/quotes/new?msg=Quote%20saved");
    } catch (e: any) {
        if (isRedirectError(e)) throw e;
        redirect(
            `/quotes/new?err=${encodeURIComponent(
                e?.message ?? "Failed to save quote"
            )}`
        );
    }
}
