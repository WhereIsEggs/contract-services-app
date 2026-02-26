import AppShell from "@/app/components/AppShell";
import Link from "next/link";
import { createClient } from "@/app/lib/supabase/server";

function formatAgeMinutes(mins: number | null) {
    if (mins === null) return "—";
    if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
    return `${mins}m ago`;
}

export default async function DashboardPage() {
    const supabase = await createClient();

    const { data: statusCounts, error } = await supabase.from("requests").select(`
    id,
    customer_name,
    overall_status,
    created_at,
    request_services (
            id,
      service_type,
      step_status,
      sort_order,
      updated_at
    )
  `);

    const rows = statusCounts ?? [];

    // --- Counts (Active vs Waiting vs Completed) ---
    const activeInProgress =
        rows.filter((r: any) => {
            if (r.overall_status !== "In Progress") return false;
            const steps = Array.isArray(r.request_services) ? r.request_services : [];
            return steps.some((s: any) => s.step_status === "In Progress");
        }).length ?? 0;

    const waitingInProgress =
        rows.filter((r: any) => {
            if (r.overall_status !== "In Progress") return false;
            const steps = Array.isArray(r.request_services) ? r.request_services : [];
            const hasActive = steps.some((s: any) => s.step_status === "In Progress");
            const hasWaiting = steps.some(
                (s: any) => s.step_status === "Not Started" || s.step_status === "Waiting"
            );
            return !hasActive && hasWaiting;
        }).length ?? 0;

    const completedCount = rows.filter((r: any) => r.overall_status === "Completed").length ?? 0;

    const counts = {
        Active: activeInProgress,
        Waiting: waitingInProgress,
        Completed: completedCount,
    };

    // --- Oldest active job (since last update on the active step) ---
    const oldestActive = (() => {
        const activeRequests = rows.filter((r: any) => {
            if (r.overall_status !== "In Progress") return false;
            const steps = Array.isArray(r.request_services) ? r.request_services : [];
            return steps.some((s: any) => s.step_status === "In Progress");
        });

        let best:
            | {
                requestId: string;
                customerName: string | null;
                minutes: number;
                label: string;
            }
            | null = null;

        for (const r of activeRequests) {
            const steps = Array.isArray(r.request_services) ? r.request_services : [];
            const sorted = steps
                .slice()
                .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

            const activeStep = sorted.find((s: any) => s.step_status === "In Progress") ?? null;
            const nextStep =
                sorted.find((s: any) => s.step_status === "Not Started" || s.step_status === "Waiting") ??
                null;

            if (!activeStep?.updated_at) continue;

            const minutes = Math.round((Date.now() - new Date(activeStep.updated_at).getTime()) / 60000);

            const label = nextStep
                ? `${activeStep.service_type} (next: ${nextStep.service_type})`
                : `${activeStep.service_type}`;

            if (best === null || minutes > best.minutes) {
                best = {
                    requestId: r.id,
                    customerName: r.customer_name ?? null,
                    minutes,
                    label,
                };
            }
        }

        return best;
    })();

    // --- Queue lists ---
    const notStartedItems = rows
        .filter((r: any) => r.overall_status === "New")
        .map((r: any) => {
            const steps = Array.isArray(r.request_services) ? r.request_services : [];
            const sorted = steps.slice().sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
            const first = sorted.find((s: any) => s.step_status === "Not Started" || s.step_status === "Waiting") ?? null;

            // Use request created_at as “age” for not-started
            const mins = r.created_at
                ? Math.max(0, Math.round((Date.now() - new Date(r.created_at).getTime()) / 60000))
                : null;

            return {
                id: r.id,
                customer: r.customer_name ?? "Unnamed customer",
                label: first ? `Ready to Start ${first.service_type}` : "Not Started",
                mins,
                age: formatAgeMinutes(mins),
            };
        })
        .sort((a: any, b: any) => (b.mins ?? -1) - (a.mins ?? -1))
        .slice(0, 6);

    const inProgressItems = rows
        .filter((r: any) => r.overall_status === "In Progress")
        .map((r: any) => {
            const steps = Array.isArray(r.request_services) ? r.request_services : [];
            const sorted = steps.slice().sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
            const active = sorted.find((s: any) => s.step_status === "In Progress") ?? null;
            const next = sorted.find((s: any) => s.step_status === "Not Started" || s.step_status === "Waiting") ?? null;

            const label = active
                ? `${active.service_type} In Progress`
                : next
                    ? `Waiting to Start ${next.service_type}`
                    : "In Progress";

            const updatedAt = active?.updated_at ?? null;
            const mins = updatedAt
                ? Math.max(0, Math.round((Date.now() - new Date(updatedAt).getTime()) / 60000))
                : null;

            return {
                id: r.id,
                customer: r.customer_name ?? "Unnamed customer",
                label,
                mins,
                age: formatAgeMinutes(mins),
            };
        })
        .sort((a: any, b: any) => (b.mins ?? -1) - (a.mins ?? -1))
        .slice(0, 6);

    // --- Recent Activity (top 5 most recently updated steps across all requests) ---
    const recentActivity = (() => {
        const items: Array<{
            requestId: string;
            customer: string;
            service: string;
            status: string;
            updatedAt: string;
            mins: number;
            age: string;
        }> = [];

        for (const r of rows) {
            const steps = Array.isArray(r.request_services) ? r.request_services : [];
            for (const s of steps) {
                if (!s?.updated_at) continue;
                const mins = Math.max(0, Math.round((Date.now() - new Date(s.updated_at).getTime()) / 60000));
                items.push({
                    requestId: r.id,
                    customer: r.customer_name ?? "Unnamed customer",
                    service: s.service_type,
                    status: s.step_status,
                    updatedAt: s.updated_at,
                    mins,
                    age: formatAgeMinutes(mins),
                });
            }
        }

        return items
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .slice(0, 5);
    })();

    const allStepIds = rows.flatMap((r: any) =>
        Array.isArray(r.request_services)
            ? (r.request_services as any[])
                .map((s: any) => String(s.id ?? ""))
                .filter(Boolean)
            : []
    );

    const { data: actualRows } = allStepIds.length
        ? await supabase
            .from("service_actuals")
            .select("service_id, data")
            .in("service_id", allStepIds)
        : { data: [] as any[] };

    const leadByServiceId = new Map<string, any>(
        (actualRows ?? []).map((r: any) => [String(r.service_id), (r?.data as any)?.lead_time ?? null])
    );

    const nowMs = Date.now();

    const lateJobsCount = rows.filter((r: any) => {
        if (r.overall_status === "Completed") return false;
        const steps = Array.isArray(r.request_services) ? (r.request_services as any[]) : [];

        return steps.some((s: any) => {
            if (String(s.step_status ?? "") === "Completed") return false;
            const lead = leadByServiceId.get(String(s.id ?? ""));
            const dueMs = lead?.due_at ? Date.parse(String(lead.due_at)) : NaN;
            return Number.isFinite(dueMs) && dueMs < nowMs;
        });
    }).length;

    return (
        <AppShell title="Dashboard" hideHeaderTitle>
            <div className="grid gap-6">
                <div className="mb-6">
                    <h2 className="text-2xl font-semibold text-neutral-100">Dashboard</h2>
                    <div className="mt-4 border-b border-neutral-800" />
                </div>

                {error ? (
                    <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-4 text-sm text-red-300">
                        Error loading dashboard data.
                    </div>
                ) : null}

                {/* Top stats (A: add color accents) */}
                <section>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <Link
                            href="/requests?status=In%20Progress&sort=request&dir=desc"
                            className="block transform rounded-lg border border-neutral-800 bg-neutral-950/40 p-3 hover:bg-neutral-900 hover:-translate-y-0.5 transition-transform border-l-4 border-l-blue-500"
                        >
                            <div className="text-xs text-neutral-400">In Progress</div>
                            <div className="mt-1 text-xl font-semibold text-neutral-100">{counts.Active}</div>
                        </Link>

                        <Link
                            href="/requests?status=In%20Progress&sort=request&dir=desc"
                            className="block transform rounded-lg border border-neutral-800 bg-neutral-950/40 p-3 hover:bg-neutral-900 hover:-translate-y-0.5 transition-transform border-l-4 border-l-amber-500"
                        >
                            <div className="text-xs text-neutral-400">Waiting</div>
                            <div className="mt-1 text-xl font-semibold text-neutral-100">{counts.Waiting}</div>
                        </Link>

                        <Link
                            href="/requests?status=Completed&sort=request&dir=desc"
                            className="block transform rounded-lg border border-neutral-800 bg-neutral-950/40 p-3 hover:bg-neutral-900 hover:-translate-y-0.5 transition-transform border-l-4 border-l-emerald-500"
                        >
                            <div className="text-xs text-neutral-400">Completed</div>
                            <div className="mt-1 text-xl font-semibold text-neutral-100">{counts.Completed}</div>
                        </Link>
                    </div>

                    {oldestActive ? (
                        <div className="mt-2 text-sm text-neutral-400">
                            Oldest active job:{" "}
                            <Link
                                href={`/requests/${oldestActive.requestId}`}
                                className="text-neutral-200 underline hover:text-white"
                            >
                                {oldestActive.customerName ?? "Unnamed customer"}
                            </Link>{" "}
                            <span className="text-neutral-500">— {oldestActive.label}</span>{" "}
                            <span className="text-neutral-200">
                                {oldestActive.minutes >= 60
                                    ? `${Math.floor(oldestActive.minutes / 60)}h ${oldestActive.minutes % 60}m`
                                    : `${oldestActive.minutes}m`}
                            </span>{" "}
                            since last update
                        </div>
                    ) : (
                        <div className="mt-2 text-sm text-neutral-500">No active jobs right now.</div>
                    )}
                </section>

                {/* Queues (D: collapse empty states) */}
                {(notStartedItems.length > 0 || inProgressItems.length > 0) ? (
                    <section className="grid gap-4 md:grid-cols-2">
                        {notStartedItems.length > 0 ? (
                            <section className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4 border-l-4 border-l-neutral-500">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-neutral-100">Not Started</h3>
                                    <Link href="/requests?sort=request&dir=desc" className="text-xs text-neutral-400 underline hover:text-neutral-200">
                                        View all
                                    </Link>
                                </div>

                                <div className="mt-3 grid gap-2">
                                    {notStartedItems.map((item: any) => (
                                        <Link
                                            key={item.id}
                                            href={`/requests/${item.id}`}
                                            className="rounded-md border border-neutral-800 bg-neutral-950/30 px-3 py-2 hover:bg-neutral-900/60 transition"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm text-neutral-100">{item.customer}</div>
                                                    <div className="truncate text-xs text-neutral-400">{item.label}</div>
                                                </div>
                                                <div className="shrink-0 text-xs text-neutral-500">{item.age}</div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </section>
                        ) : null}

                        {inProgressItems.length > 0 ? (
                            <section className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4 border-l-4 border-l-blue-500">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-neutral-100">In Progress</h3>
                                    <Link
                                        href="/requests?status=In%20Progress&sort=request&dir=desc"
                                        className="text-xs text-neutral-400 underline hover:text-neutral-200"
                                    >
                                        View all
                                    </Link>
                                </div>

                                <div className="mt-3 grid gap-2">
                                    {inProgressItems.map((item: any) => (
                                        <Link
                                            key={item.id}
                                            href={`/requests/${item.id}`}
                                            className="rounded-md border border-neutral-800 bg-neutral-950/30 px-3 py-2 hover:bg-neutral-900/60 transition"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm text-neutral-100">{item.customer}</div>
                                                    <div className="truncate text-xs text-neutral-400">{item.label}</div>
                                                </div>
                                                <div className="shrink-0 text-xs text-neutral-500">{item.age}</div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </section>
                        ) : null}
                    </section>
                ) : null}


                {/* C: Recent Activity */}
                <section className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4 border-l-4 border-l-violet-500">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-neutral-100">Recent Activity</h3>
                    </div>

                    {recentActivity.length === 0 ? (
                        <div className="mt-3 text-sm text-neutral-500">No recent activity yet.</div>
                    ) : (
                        <div className="mt-3 grid gap-2">
                            {recentActivity.map((a) => (
                                <Link
                                    key={`${a.requestId}-${a.updatedAt}-${a.service}-${a.status}`}
                                    href={`/requests/${a.requestId}`}
                                    className="rounded-md border border-neutral-800 bg-neutral-950/30 px-3 py-2 hover:bg-neutral-900/60 transition"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="truncate text-sm text-neutral-100">{a.customer}</div>
                                            <div className="truncate text-xs text-neutral-400">
                                                {a.service} — {a.status}
                                            </div>
                                        </div>
                                        <div className="shrink-0 text-xs text-neutral-500">{a.age}</div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </section>

                {/* Late Jobs (D: collapse when zero) */}
                {lateJobsCount > 0 ? (
                    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <Link
                            href="/requests?late=1&sort=request&dir=desc"
                            className="block transform rounded-lg border border-neutral-800 bg-neutral-950/40 p-3 hover:bg-neutral-900 hover:-translate-y-0.5 transition-transform border-l-4 border-l-red-500"
                        >
                            <div className="text-xs text-neutral-400">Late Jobs</div>
                            <div className="mt-1 text-xl font-semibold text-red-400">{lateJobsCount}</div>
                        </Link>
                    </section>
                ) : null}
            </div>
        </AppShell>
    );
}
