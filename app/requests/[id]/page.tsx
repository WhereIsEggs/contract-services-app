import { createClient } from "@/app/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { updateServiceStepStatus } from "@/app/actions";
import { notFound, redirect } from "next/navigation";
import ProgressUpdateToggle from "@/app/components/ProgressUpdateToggle";
import LinkedQuoteSelector from "@/app/requests/LinkedQuoteSelector";
import ConfirmSubmitButton from "@/app/requests/ConfirmSubmitButton";

function toNum(v: any) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function fmtMoney(n: any) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "—";
    return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function fmtHours(n: any) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "—";
    return `${v.toFixed(2)}h`;
}

// Map request_services label -> quote_items service_type
function quoteKeyForServiceLabel(label: string): string | null {
    const t = String(label ?? "").trim();
    if (t === "Contract Print" || t === "Contract Printing") return "CONTRACT_PRINTING";
    if (t === "3D Scanning") return "3D_SCANNING";
    if (t === "3D Design") return "3D_DESIGN";
    if (t === "Material Testing") return "MATERIAL_TESTING";
    return null;
}

export default async function RequestDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    if (!id) notFound();

    const supabase = await createClient();

    const { data: request, error } = await supabase
        .from("requests")
        .select(
            `
      id,
      request_number,
      customer_name,
      created_at,
      services_requested,
      overall_status,
      project_details,
      quote_id,
      request_services (
        id,
        service_type,
        step_status,
        sort_order,
        started_at,
        paused_at,
        completed_at,
        updated_at,
        notes
      )
    `
        )
        .eq("id", id)
        .single();

    if (error || !request) notFound();
    const overallStatus = String((request as any).overall_status ?? "");
    // ============================
    // Cost settings (rates live in DB)
    // ============================
    const { data: settingRows, error: settingErr } = await supabase
        .from("cost_settings")
        .select("key,value");

    if (settingErr) throw new Error(settingErr.message);

    const settings: Record<string, number> = Object.fromEntries(
        (settingRows ?? []).map((r: any) => [String(r.key), Number(r.value)])
    );

    const getSetting = (key: string, fallback = 0) => {
        const v = settings?.[key];
        return Number.isFinite(v) ? Number(v) : fallback;
    };

    // Quote-item service_type -> settings keys
    function billableRateForQuoteKey(quoteKey: string | null) {
        if (quoteKey === "3D_SCANNING") return getSetting("scanning_billable_rate", 0);
        if (quoteKey === "3D_DESIGN") return getSetting("design_billable_rate", 0);
        if (quoteKey === "MATERIAL_TESTING") return getSetting("testing_billable_rate", 0);
        return 0;
    }

    function internalRateForQuoteKey(quoteKey: string | null) {
        if (quoteKey === "3D_SCANNING") return getSetting("scanning_internal_rate", 0);
        if (quoteKey === "3D_DESIGN") return getSetting("design_internal_rate", 0);
        if (quoteKey === "MATERIAL_TESTING") return getSetting("testing_internal_rate", 0);
        return 0;
    }
    // Quotes dropdown
    const { data: recentQuotes, error: quotesError } = await supabase
        .from("quotes")
        .select("id,customer_name,job_name,created_at")
        .order("created_at", { ascending: false })
        .limit(50);

    // quote_ids already linked to ANY request
    const { data: linkedRows, error: linkedError } = await supabase
        .from("requests")
        .select("quote_id")
        .not("quote_id", "is", null);

    const currentQuoteId = (request as any).quote_id as string | null;

    const linkedSet = new Set<string>(
        (linkedRows ?? []).map((r: any) => r.quote_id).filter(Boolean)
    );

    const availableQuotes = linkedError
        ? (recentQuotes ?? [])
        : (recentQuotes ?? []).filter((q: any) => !linkedSet.has(q.id) || q.id === currentQuoteId);

    // Normalize steps
    const serviceSteps = Array.isArray((request as any).request_services)
        ? (((request as any).request_services as any[]) ?? [])
        : [];

    const steps = serviceSteps
        .slice()
        .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    const activeStep = steps.find((s: any) => s.step_status === "In Progress") ?? null;
    const pausedStep = steps.find((s: any) => s.step_status === "Waiting") ?? null;
    const firstNotStarted = steps.find((s: any) => s.step_status === "Not Started") ?? null;

    // ============================
    // Quoted vs Actual (Completed)
    // ============================
    const quoteId = (request as any).quote_id as string | null;

    const { data: quoteItems, error: qiErr } = quoteId
        ? await supabase
            .from("quote_items")
            .select("service_type,labor_hours,print_time_hours,params")
            .eq("quote_id", quoteId)
        : { data: null as any, error: null as any };

    const qiList = quoteItems ?? [];
    const qiByType = new Map<string, any>(qiList.map((q: any) => [String(q.service_type), q]));

    const stepIds = steps.map((s: any) => s.id).filter(Boolean);

    const { data: actualRows, error: actualErr } = stepIds.length
        ? await supabase
            .from("service_actuals")
            .select("service_id, actual_hours, data, updated_at")
            .in("service_id", stepIds)
        : { data: null as any, error: null as any };

    const actualByServiceId = new Map<string, any>(
        (actualRows ?? []).map((r: any) => [String(r.service_id), r])
    );

    const totalLeadDueMs = steps
        .filter((s: any) => s.step_status !== "Completed")
        .map((s: any) => {
            const lead = (actualByServiceId.get(String(s.id))?.data as any)?.lead_time;
            const dueMs = lead?.due_at ? Date.parse(String(lead.due_at)) : NaN;
            return Number.isFinite(dueMs) ? dueMs : NaN;
        })
        .filter((n: number) => Number.isFinite(n))
        .reduce((max: number, cur: number) => (cur > max ? cur : max), Number.NaN);

    const requestCreatedMs = Date.parse(String((request as any).created_at ?? ""));
    const totalLeadDays = Number.isFinite(totalLeadDueMs) && Number.isFinite(requestCreatedMs)
        ? Math.max(0, Math.ceil((totalLeadDueMs - requestCreatedMs) / (24 * 60 * 60 * 1000)))
        : null;

    // ---------------------------
    // Material lookup (Quoted + Actual CP extras)
    // ---------------------------
    const quotedContractParams = (qiByType.get("CONTRACT_PRINTING")?.params ?? {}) as any;

    const materialIdsForLookup = Array.from(
        new Set(
            [
                quotedContractParams?.material1_id,
                quotedContractParams?.material2_id,

                ...(actualRows ?? [])
                    .map((r: any) => r?.data?.contract_print ?? null)
                    .flatMap((cp: any) => (cp ? [cp.extra_material1_id, cp.extra_material2_id] : [])),
            ]
                .filter(Boolean)
                .map((x) => String(x))
        )
    );

    const { data: materialRows, error: materialLookupErr } = materialIdsForLookup.length
        ? await supabase.from("material_costs").select("id,name,category").in("id", materialIdsForLookup)
        : { data: [] as any[], error: null as any };

    if (materialLookupErr) throw new Error(materialLookupErr.message);

    const materialNameById = new Map<string, string>(
        (materialRows ?? []).map((m: any) => [
            String(m.id),
            `${m.category ? `${m.category} — ` : ""}${m.name}`,
        ])
    );

    function materialLabelFromId(id: any) {
        const key = String(id ?? "").trim();
        if (!key) return "—";
        return materialNameById.get(key) ?? "Unknown material";
    }

    // ============================
    // Render
    // ============================
    return (
        <AppShell
            title="Request Details"
            hideHeaderTitle
            activeNav={
                overallStatus === "Completed"
                    ? "completed"
                    : overallStatus === "In Progress" || overallStatus === "Waiting"
                        ? "in_progress"
                        : "requests"
            }
        >
            <div className="max-w-[900px] mx-auto">
                <div className="mb-6">
                    <h2 className="text-2xl font-semibold text-neutral-100">Request Details</h2>
                    <div className="mt-4 border-b border-neutral-800" />
                </div>

                <div className="bg-neutral-900 rounded-lg shadow-lg p-6">
                    <div className="grid gap-4 text-sm text-neutral-200">
                        <div>
                            <span className="text-neutral-400">Customer</span>
                            <div className="font-medium">{(request as any).customer_name || "Unnamed customer"}</div>
                        </div>

                        <div>
                            <span className="text-neutral-400">Request ID:</span>
                            <div className="font-medium">
                                {String((request as any).request_number ?? "").padStart(5, "0")}
                            </div>
                        </div>

                        <div>
                            <span className="text-neutral-400">Requested Services</span>
                            <div>{((request as any).services_requested ?? []).join(", ") || "—"}</div>
                        </div>

                        <div>
                            <span className="text-neutral-400">Linked Quote</span>

                            <div className="mt-2 grid gap-2">
                                {quotesError ? (
                                    <div className="text-xs text-red-300">Could not load quotes: {quotesError.message}</div>
                                ) : (
                                    <>
                                        <LinkedQuoteSelector
                                            requestId={id}
                                            currentQuoteId={(request as any).quote_id ?? null}
                                            quotes={(availableQuotes ?? []) as any}
                                            action={async (formData) => {
                                                "use server";
                                                const supabase = await createClient();

                                                const quoteIdRaw = String(formData.get("quote_id") ?? "").trim();
                                                const quote_id = quoteIdRaw.length ? quoteIdRaw : null;

                                                const { error } = await supabase.from("requests").update({ quote_id }).eq("id", id);
                                                if (error) throw new Error(error.message);

                                                redirect(`/requests/${id}`);
                                            }}
                                        />

                                        <div className="text-xs text-neutral-500">
                                            Tip: Use "Edit quote" to update hours/services as work progresses.
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div>
                            <span className="text-neutral-400">Service Steps</span>

                            {steps.length > 0 ? (
                                <div className="mt-2 grid gap-3">
                                    {/* Workflow buttons */}
                                    {overallStatus !== "Completed" ? (
                                        <>
                                            {activeStep ? (
                                                <>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        {/* Pause */}
                                                        <form
                                                            action={async (formData: FormData) => {
                                                                "use server";

                                                                if (!activeStep?.id) return;

                                                                await updateServiceStepStatus(activeStep.id, "Waiting");

                                                                const supabase = await createClient();
                                                                const { error } = await supabase
                                                                    .from("requests")
                                                                    .update({ overall_status: "Waiting" })
                                                                    .eq("id", id);

                                                                if (error) throw new Error(error.message);

                                                                redirect(`/requests/${id}`);
                                                            }}
                                                        >
                                                            <button
                                                                type="submit"
                                                                className="inline-flex h-10 items-center justify-center rounded-md bg-yellow-400 px-4 text-sm font-medium text-neutral-900 hover:bg-yellow-900"
                                                            >
                                                                Pause {activeStep.service_type}
                                                            </button>
                                                        </form>

                                                        {/* Complete */}
                                                        <form
                                                            action={async (formData: FormData) => {
                                                                "use server";

                                                                if (!activeStep?.id) return;

                                                                await updateServiceStepStatus(activeStep.id, "Completed");

                                                                const supabase = await createClient();
                                                                const { data: remaining } = await supabase
                                                                    .from("request_services")
                                                                    .select("id")
                                                                    .eq("request_id", id)
                                                                    .neq("step_status", "Completed")
                                                                    .limit(1);

                                                                const newOverall = (remaining ?? []).length === 0 ? "Completed" : "In Progress";

                                                                const { error } = await supabase
                                                                    .from("requests")
                                                                    .update({ overall_status: newOverall })
                                                                    .eq("id", id);

                                                                if (error) throw new Error(error.message);

                                                                redirect(`/requests/${id}/services/${activeStep.id}/adjust`);
                                                            }}
                                                        >
                                                            <button
                                                                type="submit"
                                                                className="inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-500"
                                                            >
                                                                Complete {activeStep.service_type}
                                                            </button>
                                                        </form>
                                                    </div>

                                                    <ProgressUpdateToggle
                                                        initialNotes={activeStep.notes ?? null}
                                                        action={async (formData) => {
                                                            "use server";
                                                            const notes = String(formData.get("notes") ?? "");
                                                            await updateServiceStepStatus(activeStep.id, "In Progress", notes);
                                                        }}
                                                    />
                                                </>
                                            ) : pausedStep || firstNotStarted ? (
                                                <form
                                                    action={async () => {
                                                        "use server";

                                                        const target = pausedStep ?? firstNotStarted;
                                                        if (!target?.id) return;

                                                        await updateServiceStepStatus(target.id, "In Progress");

                                                        const supabase = await createClient();
                                                        const { error } = await supabase
                                                            .from("requests")
                                                            .update({ overall_status: "In Progress" })
                                                            .eq("id", id);

                                                        if (error) throw new Error(error.message);

                                                        redirect(`/requests/${id}`);
                                                    }}
                                                >
                                                    <button
                                                        type="submit"
                                                        className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-500"
                                                    >
                                                        {pausedStep ? `Resume ${pausedStep.service_type}` : `Start ${firstNotStarted!.service_type}`}
                                                    </button>
                                                </form>
                                            ) : null}
                                        </>
                                    ) : null}

                                    <div className="mt-3 rounded-md border border-neutral-800 bg-neutral-950/30 px-3 py-2 text-xs text-neutral-400">
                                        <div>
                                            Total lead deadline:{" "}
                                            {Number.isFinite(totalLeadDueMs)
                                                ? new Date(totalLeadDueMs).toLocaleString(undefined, {
                                                    dateStyle: "medium",
                                                    timeStyle: "short",
                                                })
                                                : "—"}
                                        </div>
                                        <div className="mt-0.5">
                                            Total lead time: {totalLeadDays != null ? `${totalLeadDays} day${totalLeadDays === 1 ? "" : "s"}` : "—"}
                                        </div>
                                    </div>

                                    <ul className="grid gap-2">
                                        {steps.map((svc: any) => (
                                            <li
                                                key={svc.id}
                                                className="grid grid-cols-[1fr_auto] gap-x-3 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2"
                                            >
                                                <div className="flex flex-col">
                                                    <span className="text-neutral-100">{svc.service_type}</span>

                                                    {(() => {
                                                        const lead = (actualByServiceId.get(String(svc.id))?.data as any)?.lead_time;
                                                        const dueMs = lead?.due_at ? Date.parse(String(lead.due_at)) : NaN;
                                                        const leadDays = Number(lead?.lead_days);
                                                        return Number.isFinite(dueMs) ? (
                                                            <div className="mt-1 text-xs text-neutral-400">
                                                                Lead: {Number.isFinite(leadDays) ? `${leadDays}d` : "—"} • Due{" "}
                                                                {new Date(dueMs).toLocaleString(undefined, {
                                                                    dateStyle: "medium",
                                                                    timeStyle: "short",
                                                                })}
                                                            </div>
                                                        ) : null;
                                                    })()}

                                                    {svc.started_at || svc.step_status === "Waiting" || svc.completed_at ? (
                                                        <div className="mt-1 flex flex-col gap-0.5 text-xs text-neutral-500">
                                                            {svc.started_at ? (
                                                                <div>
                                                                    Started:{" "}
                                                                    {new Date(svc.started_at).toLocaleString(undefined, {
                                                                        dateStyle: "medium",
                                                                        timeStyle: "short",
                                                                    })}
                                                                </div>
                                                            ) : null}

                                                            {svc.step_status === "Waiting" ? (
                                                                <div>
                                                                    Paused:{" "}
                                                                    {svc.paused_at
                                                                        ? new Date(svc.paused_at).toLocaleString(undefined, {
                                                                            dateStyle: "medium",
                                                                            timeStyle: "short",
                                                                        })
                                                                        : "—"}
                                                                </div>
                                                            ) : null}

                                                            {svc.completed_at ? (
                                                                <div>
                                                                    Completed:{" "}
                                                                    {new Date(svc.completed_at).toLocaleString(undefined, {
                                                                        dateStyle: "medium",
                                                                        timeStyle: "short",
                                                                    })}
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    ) : null}
                                                </div>

                                                {svc.step_status !== "In Progress" ? (
                                                    svc.step_status === "Waiting" ? (
                                                        <span className="col-start-2 row-start-1 self-start justify-self-end text-xs rounded-full border border-amber-700/60 bg-amber-950/30 px-2 py-1 text-amber-200">
                                                            Paused
                                                        </span>
                                                    ) : (
                                                        <span className="col-start-2 row-start-1 self-start justify-self-end text-xs rounded-full border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-300">
                                                            {svc.step_status}
                                                        </span>
                                                    )
                                                ) : (
                                                    <span className="col-start-2 row-start-1 self-start justify-self-end text-xs text-neutral-500"></span>
                                                )}

                                                {svc.step_status !== "In Progress" && svc.notes ? (
                                                    <div className="col-span-2 mt-2 rounded-md border border-neutral-800 bg-neutral-950/30 px-3 py-2 text-xs text-neutral-300 whitespace-pre-wrap">
                                                        {svc.notes}
                                                    </div>
                                                ) : null}

                                                {svc.step_status === "Completed" && !activeStep && !pausedStep ? (
                                                    <div className="col-span-2 mt-2">
                                                        <form
                                                            action={async (formData: FormData) => {
                                                                "use server";

                                                                const restartNote = String(
                                                                    formData.get("restart_note") ?? ""
                                                                ).trim();

                                                                if (!restartNote) {
                                                                    throw new Error("Restart note is required.");
                                                                }

                                                                await updateServiceStepStatus(
                                                                    svc.id,
                                                                    "In Progress",
                                                                    `Service restarted: ${restartNote}`
                                                                );

                                                                const supabase = await createClient();
                                                                const { error } = await supabase
                                                                    .from("requests")
                                                                    .update({ overall_status: "In Progress" })
                                                                    .eq("id", id);

                                                                if (error) throw new Error(error.message);

                                                                redirect(`/requests/${id}`);
                                                            }}
                                                            className="flex flex-wrap items-center gap-2"
                                                        >
                                                            <input
                                                                name="restart_note"
                                                                required
                                                                defaultValue=""
                                                                className="h-8 w-72 rounded-md border border-neutral-700 bg-neutral-950 px-2 text-xs text-neutral-100 placeholder-neutral-500"
                                                                placeholder="Required restart note"
                                                            />
                                                            <ConfirmSubmitButton
                                                                label="Restart service"
                                                                confirmMessage="Reopen this completed service and mark it In Progress?"
                                                                className="inline-flex h-8 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 px-3 text-xs font-medium text-neutral-200 hover:bg-neutral-800"
                                                            />
                                                        </form>
                                                    </div>
                                                ) : null}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <div className="mt-1 text-neutral-500">—</div>
                            )}
                        </div>

                        {/* =========================
                Completed Summary: Quoted vs Actual
            ========================== */}
                        {overallStatus === "Completed" ? (
                            <div>
                                <span className="text-neutral-400">Quoted vs Actual</span>

                                <div className="mt-2 grid gap-3 md:grid-cols-2">
                                    {/* QUOTED */}
                                    <div className="rounded-md border border-neutral-800 bg-neutral-950/40 p-4">
                                        <div className="text-sm font-medium text-neutral-100">Quoted</div>

                                        {!quoteId ? (
                                            <div className="mt-2 text-sm text-neutral-400">No quote linked.</div>
                                        ) : qiErr ? (
                                            <div className="mt-2 text-sm text-red-300">Failed to load quote items: {qiErr.message}</div>
                                        ) : (
                                            <div className="mt-3 grid gap-3 text-sm text-neutral-200">
                                                {steps.map((svc: any) => {
                                                    const t = String(svc.service_type ?? "").trim();
                                                    const quoteKey = quoteKeyForServiceLabel(t);
                                                    const qi = quoteKey ? (qiByType.get(quoteKey) ?? null) : null;

                                                    const isContract = quoteKey === "CONTRACT_PRINTING";
                                                    const qp = qi?.params ?? null;
                                                    const qc = qp?.calc ?? null;

                                                    const quoteTotal =
                                                        toNum(qc?.V2_totalWithExternalLabor) ||
                                                        toNum(qc?.total_with_external_labor) ||
                                                        (toNum(qc?.U2_withFailRate) + toNum(qc?.W2_laborFees_billable));

                                                    const quotedMaterials = [
                                                        {
                                                            id: String(qp?.material1_id ?? "").trim(),
                                                            grams: toNum(qp?.material1_grams),
                                                        },
                                                        {
                                                            id: String(qp?.material2_id ?? "").trim(),
                                                            grams: toNum(qp?.material2_grams),
                                                        },
                                                    ].filter((m) => m.grams > 0 && m.id.length > 0 && materialNameById.has(m.id));

                                                    const materialsText = quotedMaterials
                                                        .map((m) => `${materialNameById.get(m.id)}: ${m.grams.toFixed(0)}g`)
                                                        .join(", ");

                                                    return (
                                                        <div key={svc.id} className="rounded-md border border-neutral-800 bg-neutral-950/30 p-3">
                                                            <div className="font-medium text-neutral-100">{t}</div>

                                                            {isContract ? (
                                                                qi ? (
                                                                    <div className="mt-2 grid gap-1">
                                                                        <div>
                                                                            Print time: <span className="text-neutral-100">{fmtHours(qi.print_time_hours)}</span>
                                                                        </div>
                                                                        <div>
                                                                            Setup time: <span className="text-neutral-100">{fmtHours(qp?.setup_hours)}</span>
                                                                        </div>
                                                                        <div>
                                                                            Support removal time:{" "}
                                                                            <span className="text-neutral-100">{fmtHours(qp?.support_removal_hours)}</span>
                                                                        </div>
                                                                        <div>
                                                                            Admin time: <span className="text-neutral-100">{fmtHours(qp?.admin_hours)}</span>
                                                                        </div>

                                                                        {quotedMaterials.length > 0 ? (
                                                                            <div>
                                                                                Materials: <span className="text-neutral-100">{materialsText}</span>
                                                                            </div>
                                                                        ) : null}

                                                                        {/* separator below Admin time + materials */}
                                                                        <div className="my-2 border-t border-neutral-800" />

                                                                        <div className="mt-1">
                                                                            Quote total: <span className="text-neutral-100">{fmtMoney(quoteTotal)}</span>
                                                                        </div>
                                                                        <div>
                                                                            Internal total cost:{" "}
                                                                            <span className="text-neutral-100">{fmtMoney(qc?.V2_internalTotalCost)}</span>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="mt-2 text-sm text-neutral-400">No quote item found.</div>
                                                                )
                                                            ) : (
                                                                <div className="mt-2 grid gap-1">
                                                                    <div>
                                                                        Quoted hours: <span className="text-neutral-100">{fmtHours(qi?.labor_hours)}</span>
                                                                    </div>

                                                                    {qi ? (
                                                                        <>
                                                                            <div className="my-2 border-t border-neutral-800" />

                                                                            <div>
                                                                                Quote total:{" "}
                                                                                <span className="text-neutral-100">
                                                                                    {fmtMoney(toNum(qi.labor_hours) * billableRateForQuoteKey(quoteKey))}
                                                                                </span>
                                                                            </div>

                                                                            <div>
                                                                                Internal total cost:{" "}
                                                                                <span className="text-neutral-100">
                                                                                    {fmtMoney(toNum(qi.labor_hours) * internalRateForQuoteKey(quoteKey))}
                                                                                </span>
                                                                            </div>
                                                                        </>
                                                                    ) : null}
                                                                </div>
                                                            )}                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* ACTUAL */}
                                    <div className="rounded-md border border-neutral-800 bg-neutral-950/40 p-4">
                                        <div className="text-sm font-medium text-neutral-100">Actual</div>

                                        {actualErr ? (
                                            <div className="mt-2 text-sm text-red-300">Failed to load service actuals: {actualErr.message}</div>
                                        ) : (
                                            <div className="mt-3 grid gap-3 text-sm text-neutral-200">
                                                {steps.map((svc: any) => {
                                                    const ar = actualByServiceId.get(String(svc.id)) ?? null;
                                                    const cp = ar?.data?.contract_print ?? null;
                                                    const cpCalc = cp?.calc_actual ?? null;

                                                    const t = String(svc.service_type ?? "").trim();
                                                    const isContract = t === "Contract Print" || t === "Contract Printing";

                                                    const extraMaterialsText = (() => {
                                                        if (!cp) return "—";

                                                        const rows: { id: string; grams: number }[] = [];

                                                        const id1 = String(cp.extra_material1_id ?? "").trim();
                                                        const g1 = Number(cp.extra_material1_grams ?? 0);
                                                        if (id1 && Number.isFinite(g1) && g1 > 0) rows.push({ id: id1, grams: g1 });

                                                        const id2 = String(cp.extra_material2_id ?? "").trim();
                                                        const g2 = Number(cp.extra_material2_grams ?? 0);
                                                        if (id2 && Number.isFinite(g2) && g2 > 0) rows.push({ id: id2, grams: g2 });

                                                        if (!rows.length) return "—";
                                                        return rows.map((r) => `${materialLabelFromId(r.id)}: ${r.grams}g`).join(", ");
                                                    })();

                                                    return (
                                                        <div key={svc.id} className="rounded-md border border-neutral-800 bg-neutral-950/30 p-3">
                                                            <div className="font-medium text-neutral-100">{t}</div>

                                                            {!isContract ? (
                                                                <div className="mt-2 grid gap-1">
                                                                    <div>
                                                                        Actual hours:{" "}
                                                                        <span className="text-neutral-100">
                                                                            {ar?.actual_hours !== null && ar?.actual_hours !== undefined
                                                                                ? fmtHours(ar.actual_hours)
                                                                                : "—"}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="mt-2 grid gap-1">
                                                                    <div>
                                                                        Restarted:{" "}
                                                                        <span className="text-neutral-100">{cp ? (cp.restarted ? "Yes" : "No") : "—"}</span>
                                                                    </div>

                                                                    <div>
                                                                        Extra machine time:{" "}
                                                                        <span className="text-neutral-100">
                                                                            {cp ? fmtHours(cp.extra_machine_hours) : "—"}
                                                                        </span>
                                                                    </div>

                                                                    <div>
                                                                        Extra setup time:{" "}
                                                                        <span className="text-neutral-100">{cp ? fmtHours(cp.extra_setup_hours) : "—"}</span>
                                                                    </div>

                                                                    <div>
                                                                        Extra support removal time:{" "}
                                                                        <span className="text-neutral-100">
                                                                            {cp ? fmtHours(cp.extra_support_removal_hours) : "—"}
                                                                        </span>
                                                                    </div>

                                                                    <div>
                                                                        Extra materials: <span className="text-neutral-100">{extraMaterialsText}</span>
                                                                    </div>

                                                                    {cpCalc ? (
                                                                        <div className="mt-2 border-t border-neutral-800 pt-2">
                                                                            <div>
                                                                                Internal total cost:{" "}
                                                                                <span className="text-neutral-100">{fmtMoney(cpCalc.V2_internalTotalCost)}</span>
                                                                            </div>
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        <div>
                            <span className="text-neutral-400">Status</span>
                            <div>
                                {activeStep
                                    ? `${activeStep.service_type} In Progress`
                                    : pausedStep
                                        ? `${pausedStep.service_type} Paused`
                                        : firstNotStarted
                                            ? `Waiting to Start ${firstNotStarted.service_type}`
                                            : overallStatus}
                            </div>
                        </div>

                        <div>
                            <span className="text-neutral-400">Submitted</span>
                            <div>
                                {new Date((request as any).created_at).toLocaleString(undefined, {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                })}
                            </div>
                        </div>

                        <div>
                            <span className="text-neutral-400">Project Details</span>
                            <div className="whitespace-pre-wrap">{(request as any).project_details || "—"}</div>
                        </div>
                    </div>
                </div>
            </div>
        </AppShell>
    );
}