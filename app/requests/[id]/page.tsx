import { createClient } from "@/app/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { updateServiceStepStatus } from "@/app/actions";
import { notFound, redirect } from "next/navigation";
import ProgressUpdateToggle from "@/app/components/ProgressUpdateToggle";
import LinkedQuoteSelector from "@/app/requests/LinkedQuoteSelector";



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

    const { data: recentQuotes, error: quotesError } = await supabase
        .from("quotes")
        .select("id,customer_name,job_name,created_at")
        .order("created_at", { ascending: false })
        .limit(50);

    // Build a set of quote_ids already linked to ANY request
    const { data: linkedRows, error: linkedError } = await supabase
        .from("requests")
        .select("quote_id")
        .not("quote_id", "is", null);

    const currentQuoteId = (request as any).quote_id as string | null;

    const linkedSet = new Set<string>(
        (linkedRows ?? [])
            .map((r: any) => r.quote_id)
            .filter(Boolean)
    );

    const availableQuotes =
        linkedError
            ? (recentQuotes ?? [])
            : (recentQuotes ?? []).filter((q: any) => !linkedSet.has(q.id) || q.id === currentQuoteId);


    // Normalize nested rows
    const serviceSteps = Array.isArray((request as any).request_services)
        ? (((request as any).request_services as any[]) ?? [])
        : [];

    // Sort once, use everywhere
    const steps = serviceSteps
        .slice()
        .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    const activeStep = steps.find((s: any) => s.step_status === "In Progress") ?? null;

    // If a step is Waiting, we treat it as "Paused" (resume path), not "not started"
    const pausedStep = steps.find((s: any) => s.step_status === "Waiting") ?? null;

    // True "not started" means never started yet
    const firstNotStarted = steps.find((s: any) => s.step_status === "Not Started") ?? null;

    // ==========================================
    // Completed view: Quoted vs Actual (snapshot)
    // ==========================================
    const quoteId = (request as any).quote_id as string | null;

    // Pull quote items (quoted baseline)
    const { data: quoteItems, error: qiErr } = quoteId
        ? await supabase
            .from("quote_items")
            .select("service_type,labor_hours,print_time_hours,params")
            .eq("quote_id", quoteId)
        : { data: null as any, error: null as any };

    // Pull actuals entered per service step
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

    const qiList = quoteItems ?? [];
    const qiByType = new Map<string, any>(
        qiList.map((q: any) => [String(q.service_type), q])
    );

    const qiContract = qiByType.get("CONTRACT_PRINTING") ?? null;
    const qiScan = qiByType.get("3D_SCANNING") ?? null;
    const qiDesign = qiByType.get("3D_DESIGN") ?? null;
    const qiTest = qiByType.get("MATERIAL_TESTING") ?? null;

    const contractParams = qiContract?.params ?? null;
    const contractCalc = contractParams?.calc ?? null;

    const fmtMoney = (n: any) => {
        const v = Number(n);
        if (!Number.isFinite(v)) return "—";
        return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
    };

    const fmtHours = (n: any) => {
        const v = Number(n);
        if (!Number.isFinite(v)) return "—";
        return `${v.toFixed(2)}h`;
    };

    return (
        <AppShell
            title="Request Details"
            hideHeaderTitle
            activeNav={
                request.overall_status === "Completed"
                    ? "completed"
                    : request.overall_status === "In Progress" || request.overall_status === "Waiting"
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
                            <div className="font-medium">{request.customer_name || "Unnamed customer"}</div>
                        </div>

                        <div>
                            <span className="text-neutral-400">Request ID:</span>
                            <div className="font-medium">
                                {String((request as any).request_number ?? "").padStart(5, "0")}
                            </div>
                        </div>


                        <div>
                            <span className="text-neutral-400">Requested Services</span>
                            <div>{(request.services_requested ?? []).join(", ") || "—"}</div>
                        </div>

                        <div>
                            <span className="text-neutral-400">Linked Quote</span>

                            <div className="mt-2 grid gap-2">
                                {quotesError ? (
                                    <div className="text-xs text-red-300">Could not load quotes: {quotesError.message}</div>
                                ) : (
                                    <>
                                        {/* Attach / change quote */}
                                        <LinkedQuoteSelector
                                            requestId={id}
                                            currentQuoteId={(request as any).quote_id ?? null}
                                            quotes={(availableQuotes ?? []) as any}
                                            action={async (formData) => {
                                                "use server";
                                                const supabase = await createClient();

                                                const quoteIdRaw = String(formData.get("quote_id") ?? "").trim();
                                                const quote_id = quoteIdRaw.length ? quoteIdRaw : null;

                                                const { error } = await supabase
                                                    .from("requests")
                                                    .update({ quote_id })
                                                    .eq("id", id);

                                                if (error) throw new Error(error.message);

                                                redirect(`/requests/${id}`);
                                            }}
                                        />
                                        {/* Quick link to view the quote list */}
                                        <div className="text-xs text-neutral-500">
                                            Tip: Open the Quote Tool in another tab to copy details. (Quote detail view comes later.)
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
                                    {request.overall_status !== "Completed" ? (
                                        <>
                                            {activeStep ? (
                                                <>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        {/* Pause */}
                                                        <form
                                                            action={async () => {
                                                                "use server";

                                                                if (!activeStep?.id) return;

                                                                // Pause the active step (we'll treat this as "Waiting" for now)
                                                                await updateServiceStepStatus(activeStep.id, "Waiting");

                                                                // Set request to Waiting (paused at request level)
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
                                                            action={async () => {
                                                                "use server";

                                                                if (!activeStep?.id) return;

                                                                // Complete the active step
                                                                await updateServiceStepStatus(activeStep.id, "Completed");

                                                                // Keep overall status in sync (Completed if no more steps, else In Progress)
                                                                const supabase = await createClient();

                                                                const { data: remaining } = await supabase
                                                                    .from("request_services")
                                                                    .select("id")
                                                                    .eq("request_id", id)
                                                                    .neq("step_status", "Completed")
                                                                    .limit(1);

                                                                const overall_status =
                                                                    (remaining ?? []).length === 0 ? "Completed" : "In Progress";

                                                                const { error } = await supabase
                                                                    .from("requests")
                                                                    .update({ overall_status })
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
                                            ) : (pausedStep || firstNotStarted) ? (
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
                                                        {pausedStep
                                                            ? `Resume ${pausedStep.service_type}`
                                                            : `Start ${firstNotStarted!.service_type}`}
                                                    </button>
                                                </form>
                                            ) : null}
                                        </>
                                    ) : null}

                                    <ul className="grid gap-2">
                                        {steps.map((svc: any) => (
                                            <li
                                                key={svc.id}
                                                className="grid grid-cols-[1fr_auto] gap-x-3 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2"
                                            >
                                                {/* Left column: service + timestamps */}
                                                <div className="flex flex-col">
                                                    <span className="text-neutral-100">{svc.service_type}</span>

                                                    {(svc.started_at || svc.step_status === "Waiting" || svc.completed_at) ? (
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

                                                {/* Right column: status pill (top-right) */}
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

                                                {/* Full-width notes (only when NOT active) */}
                                                {svc.step_status !== "In Progress" && svc.notes ? (
                                                    <div className="col-span-2 mt-2 rounded-md border border-neutral-800 bg-neutral-950/30 px-3 py-2 text-xs text-neutral-300 whitespace-pre-wrap">
                                                        {svc.notes}
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
                        {request.overall_status === "Completed" ? (
                            <div>
                                <span className="text-neutral-400">Quoted vs Actual</span>

                                <div className="mt-2 grid gap-3 md:grid-cols-2">
                                    {/* QUOTED */}
                                    <div className="rounded-md border border-neutral-800 bg-neutral-950/40 p-4">
                                        <div className="text-sm font-medium text-neutral-100">Quoted</div>

                                        {!quoteId ? (
                                            <div className="mt-2 text-sm text-neutral-400">No quote linked.</div>
                                        ) : qiErr ? (
                                            <div className="mt-2 text-sm text-red-300">
                                                Failed to load quote items: {qiErr.message}
                                            </div>
                                        ) : (
                                            <div className="mt-3 grid gap-3 text-sm text-neutral-200">
                                                {steps.map((svc: any) => {
                                                    const t = String(svc.service_type ?? "").trim();

                                                    // Map request_services label -> quote_items service_type
                                                    let quoteKey: string | null = null;
                                                    if (t === "Contract Print" || t === "Contract Printing") quoteKey = "CONTRACT_PRINTING";
                                                    else if (t === "3D Scanning") quoteKey = "3D_SCANNING";
                                                    else if (t === "3D Design") quoteKey = "3D_DESIGN";
                                                    else if (t === "Material Testing") quoteKey = "MATERIAL_TESTING";

                                                    const qi = quoteKey ? (qiByType.get(quoteKey) ?? null) : null;
                                                    const isContract = quoteKey === "CONTRACT_PRINTING";
                                                    const qp = qi?.params ?? null;
                                                    const qc = qp?.calc ?? null;

                                                    return (
                                                        <div
                                                            key={svc.id}
                                                            className="rounded-md border border-neutral-800 bg-neutral-950/30 p-3"
                                                        >
                                                            <div className="font-medium text-neutral-100">{t}</div>

                                                            {isContract ? (
                                                                qi ? (
                                                                    <div className="mt-2 grid gap-1">
                                                                        <div>
                                                                            Print time:{" "}
                                                                            <span className="text-neutral-100">{fmtHours(qi.print_time_hours)}</span>
                                                                        </div>
                                                                        <div>
                                                                            Setup time:{" "}
                                                                            <span className="text-neutral-100">{fmtHours(qp?.setup_hours)}</span>
                                                                        </div>
                                                                        <div>
                                                                            Support removal time:{" "}
                                                                            <span className="text-neutral-100">{fmtHours(qp?.support_removal_hours)}</span>
                                                                        </div>
                                                                        <div>
                                                                            Admin time:{" "}
                                                                            <span className="text-neutral-100">{fmtHours(qp?.admin_hours)}</span>
                                                                        </div>
                                                                        <div className="mt-1">
                                                                            Billable labor:{" "}
                                                                            <span className="text-neutral-100">{fmtMoney(qc?.W2_laborFees_billable)}</span>
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
                                                                        Quoted hours:{" "}
                                                                        <span className="text-neutral-100">{fmtHours(qi?.labor_hours)}</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* ACTUAL */}
                                    <div className="rounded-md border border-neutral-800 bg-neutral-950/40 p-4">
                                        <div className="text-sm font-medium text-neutral-100">Actual</div>

                                        {actualErr ? (
                                            <div className="mt-2 text-sm text-red-300">
                                                Failed to load service actuals: {actualErr.message}
                                            </div>
                                        ) : (
                                            <div className="mt-3 grid gap-3 text-sm text-neutral-200">
                                                {steps.map((svc: any) => {
                                                    const ar = actualByServiceId.get(String(svc.id)) ?? null;
                                                    const cp = ar?.data?.contract_print ?? null;
                                                    const t = String(svc.service_type ?? "").trim();
                                                    const isContract = t === "Contract Print" || t === "Contract Printing";

                                                    return (
                                                        <div
                                                            key={svc.id}
                                                            className="rounded-md border border-neutral-800 bg-neutral-950/30 p-3"
                                                        >
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
                                                                        <span className="text-neutral-100">
                                                                            {cp ? (cp.restarted ? "Yes" : "No") : "—"}
                                                                        </span>
                                                                    </div>
                                                                    <div>
                                                                        Extra machine time:{" "}
                                                                        <span className="text-neutral-100">
                                                                            {cp ? fmtHours(cp.extra_machine_hours) : "—"}
                                                                        </span>
                                                                    </div>
                                                                    <div>
                                                                        Extra setup time:{" "}
                                                                        <span className="text-neutral-100">
                                                                            {cp ? fmtHours(cp.extra_setup_hours) : "—"}
                                                                        </span>
                                                                    </div>
                                                                    <div>
                                                                        Extra support removal time:{" "}
                                                                        <span className="text-neutral-100">
                                                                            {cp ? fmtHours(cp.extra_support_removal_hours) : "—"}
                                                                        </span>
                                                                    </div>
                                                                    <div>
                                                                        Extra materials:{" "}
                                                                        <span className="text-neutral-100">
                                                                            {cp?.extra_materials?.length
                                                                                ? cp.extra_materials
                                                                                    .map((x: any) => `${String(x.material_id).slice(0, 8)}…: ${x.grams}g`)
                                                                                    .join(", ")
                                                                                : "—"}
                                                                        </span>
                                                                    </div>
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
                        ) : null}                        <div>
                            <span className="text-neutral-400">Status</span>
                            <div>
                                {activeStep
                                    ? `${activeStep.service_type} In Progress`
                                    : pausedStep
                                        ? `${pausedStep.service_type} Paused`
                                        : firstNotStarted
                                            ? `Waiting to Start ${firstNotStarted.service_type}`
                                            : request.overall_status}
                            </div>
                        </div>

                        <div>
                            <span className="text-neutral-400">Submitted</span>
                            <div>
                                {new Date(request.created_at).toLocaleString(undefined, {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                })}
                            </div>
                        </div>

                        <div>
                            <span className="text-neutral-400">Project Details</span>
                            <div className="whitespace-pre-wrap">{request.project_details || "—"}</div>
                        </div>
                    </div>
                </div>
            </div>
        </AppShell >
    );
}
