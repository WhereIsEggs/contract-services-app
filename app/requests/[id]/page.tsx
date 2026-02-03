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
    const firstNotStarted = steps.find((s: any) => s.step_status === "Not Started") ?? null;

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
                                    {activeStep ? (
                                        <>
                                            <>
                                                <form
                                                    action={async () => {
                                                        "use server";
                                                        await updateServiceStepStatus(activeStep.id, "Completed");
                                                    }}
                                                >
                                                    <button
                                                        type="submit"
                                                        className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-neutral-900 transition"
                                                    >
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

                                            {/*                                             <form
                                                action={async (formData) => {
                                                    "use server";
                                                    const notes = String(formData.get("notes") ?? "");
                                                    await updateServiceStepStatus(activeStep.id, "Waiting", notes);
                                                }}
                                                className="grid gap-2"
                                            >
                                                <textarea
                                                    name="notes"
                                                    placeholder="Reason for waiting…"
                                                    className="w-full rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                                    rows={3}
                                                />
                                                <button
                                                    type="submit"
                                                    className="inline-flex items-center justify-center rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-neutral-900 transition"
                                                >
                                                    Block {activeStep.service_type}
                                                </button>
                                            </form>
 */}                                        </>
                                    ) : firstNotStarted ? (
                                        <form
                                            action={async () => {
                                                "use server";
                                                await updateServiceStepStatus(firstNotStarted.id, "In Progress");
                                            }}
                                        >
                                            <button
                                                type="submit"
                                                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-900 transition"
                                            >
                                                Start {firstNotStarted.service_type}
                                            </button>
                                        </form>
                                    ) : null}

                                    {/* Steps list */}
                                    <ul className="grid gap-2">
                                        {steps.map((svc: any) => (
                                            <li
                                                key={svc.id}
                                                className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2"
                                            >
                                                <div className="flex flex-col">
                                                    <span className="text-neutral-100">{svc.service_type}</span>

                                                    {(svc.started_at || svc.completed_at) ? (
                                                        <span className="mt-0.5 text-xs text-neutral-500">
                                                            {svc.started_at ? `Started: ${new Date(svc.started_at).toLocaleString()}` : ""}
                                                            {svc.started_at && svc.completed_at ? " • " : ""}
                                                            {svc.completed_at ? `Completed: ${new Date(svc.completed_at).toLocaleString()}` : ""}
                                                        </span>
                                                    ) : null}
                                                </div>

                                                {svc.step_status !== "In Progress" ? (
                                                    <span className="text-xs rounded-full border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-300">
                                                        {svc.step_status}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-neutral-500"></span>
                                                )}
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
                            <div>{activeStep ? `${activeStep.service_type} In Progress` : request.overall_status}</div>
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
        </AppShell>
    );
}
