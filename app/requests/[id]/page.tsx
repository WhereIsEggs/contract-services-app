import { createClient } from "@/app/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { updateServiceStepStatus } from "@/app/actions";
import { notFound } from "next/navigation";
import ProgressUpdateToggle from "@/app/components/ProgressUpdateToggle";



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
        customer_name,
        created_at,
        services_requested,
        overall_status,
        project_details,
request_services (
  id,
  service_type,
  step_status,
  sort_order,
  started_at,
  completed_at,
  updated_at,
  notes
)
      `
        )
        .eq("id", id)
        .single();

    if (error || !request) notFound();

    // Normalize nested rows
    const serviceSteps = Array.isArray((request as any).request_services)
        ? (((request as any).request_services as any[]) ?? [])
        : [];

    // Sort once, use everywhere
    const steps = serviceSteps
        .slice()
        .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    const activeStep = steps.find((s: any) => s.step_status === "In Progress") ?? null;
    const firstNotStarted =
        steps.find((s: any) => s.step_status === "Not Started" || s.step_status === "Waiting") ?? null;

    return (
        <AppShell title="Request Details" hideHeaderTitle>
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
                            <span className="text-neutral-400">Requested Services</span>
                            <div>{(request.services_requested ?? []).join(", ") || "—"}</div>
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
                                                    <form
                                                        action={async () => {
                                                            "use server";
                                                            await updateServiceStepStatus(activeStep.id, "Completed");
                                                        }}
                                                    >
                                                        <button type="submit">
                                                            Complete {activeStep.service_type}
                                                        </button>
                                                    </form>

                                                    <ProgressUpdateToggle
                                                        initialNotes={activeStep.notes ?? null}
                                                        action={async (formData) => {
                                                            "use server";
                                                            const notes = String(formData.get("notes") ?? "");
                                                            await updateServiceStepStatus(activeStep.id, "In Progress", notes);
                                                        }}
                                                    />
                                                </>
                                            ) : firstNotStarted ? (
                                                <form
                                                    action={async () => {
                                                        "use server";
                                                        await updateServiceStepStatus(firstNotStarted.id, "In Progress");
                                                    }}
                                                >
                                                    <button type="submit">
                                                        Start {firstNotStarted.service_type}
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

                                                    {(svc.started_at || svc.completed_at || svc.updated_at) ? (
                                                        <span className="mt-0.5 text-xs text-neutral-500">
                                                            {svc.started_at ? `Started: ${new Date(svc.started_at).toLocaleString()}` : ""}
                                                            {svc.started_at && svc.completed_at ? " • " : ""}
                                                            {svc.completed_at ? `Completed: ${new Date(svc.completed_at).toLocaleString()}` : ""}
                                                            {svc.started_at && svc.completed_at ? (() => {
                                                                const ms =
                                                                    new Date(svc.completed_at).getTime() - new Date(svc.started_at).getTime();
                                                                const mins = Math.max(0, Math.round(ms / 60000));
                                                                const h = Math.floor(mins / 60);
                                                                const m = mins % 60;
                                                                const label = h > 0 ? `${h}h ${m}m` : `${m}m`;
                                                                return ` • Duration: ${label}`;
                                                            })() : ""}
                                                            {svc.updated_at ? ` • Last updated: ${new Date(svc.updated_at).toLocaleString()}` : ""}
                                                        </span>
                                                    ) : null}
                                                </div>

                                                {/* Right column: status pill (top-right) */}
                                                {svc.step_status !== "In Progress" ? (
                                                    <span className="col-start-2 row-start-1 self-start justify-self-end text-xs rounded-full border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-300">
                                                        {svc.step_status}
                                                    </span>
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

                        <div>
                            <span className="text-neutral-400">Status</span>
                            <div>
                                {activeStep
                                    ? `${activeStep.service_type} In Progress`
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
