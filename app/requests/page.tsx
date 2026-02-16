import { createClient } from "../lib/supabase/server";
import { redirect } from "next/navigation";
import AppShell from "../components/AppShell";
import Link from "next/link";



type RequestRow = {
    id: string;
    created_at: string;
    customer_name: string | null;
    services_requested: string[] | null;
    overall_status: string;
    job_deadline: string | null;
};


export default async function RequestsPage({
    searchParams,
}: {
    searchParams?: Promise<{ status?: string; late?: string; q?: string }>;
}) {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }
    const sp = await searchParams;
    const { status: rawStatus, late, q: rawQ } = sp ?? {};
    const q = (rawQ ?? "").trim();

    const normalizedStatus = (rawStatus ?? "").trim().replace(/:$/, "");
    const allowedStatuses = new Set(["In Progress", "Completed"]);
    const status = allowedStatuses.has(normalizedStatus) ? normalizedStatus : undefined;

    let query = supabase
        .from("requests")
        .select(`
  id,
  created_at,
  customer_name,
  services_requested,
  overall_status,
  request_services (
    service_type,
    step_status,
    sort_order,
    started_at,
    paused_at,
    completed_at,
    updated_at
  )
`)
        .limit(10);

    if (status === "In Progress") {
        // Treat paused requests (overall_status = Waiting) as part of the In Progress queue
        query = query.in("overall_status", ["In Progress", "Waiting"]);
    } else if (status) {
        query = query.eq("overall_status", status);
    }

    if (q.length > 0) {
        query = query.ilike("customer_name", `%${q}%`);
    }


    // If no explicit status filter is set, treat /requests as the "New Requests" intake queue,
    // BUT if the user is searching, search across all statuses.
    if (!status && !late && q.length === 0) {
        query = query.eq("overall_status", "New");
    }


    if (late) {
        const nowIso = new Date().toISOString();
        query = query
            .not("job_deadline", "is", null)
            .lt("job_deadline", nowIso)
            .neq("overall_status", "Completed");
    }

    const { data: rawData, error } = await query.returns<RequestRow[]>();

    let data = rawData ?? [];

    // Only apply the smart queue sort on the In Progress view
    if (status === "In Progress") {
        data = data.slice().sort((a: any, b: any) => {
            const aSteps = Array.isArray(a.request_services)
                ? (a.request_services as any[]).slice().sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0))
                : [];
            const bSteps = Array.isArray(b.request_services)
                ? (b.request_services as any[]).slice().sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0))
                : [];

            const aActive = aSteps.some((s) => s.step_status === "In Progress");
            const bActive = bSteps.some((s) => s.step_status === "In Progress");

            if (aActive !== bActive) return aActive ? -1 : 1;

            const aPaused = aSteps.some((s) => s.step_status === "Waiting");
            const bPaused = bSteps.some((s) => s.step_status === "Waiting");

            if (aPaused !== bPaused) return aPaused ? -1 : 1;

            const aLast = Math.max(
                Date.parse(a.created_at ?? "") || 0,
                ...aSteps.map((s) =>
                    Math.max(
                        Date.parse(s.updated_at ?? "") || 0,
                        Date.parse(s.started_at ?? "") || 0,
                        Date.parse(s.paused_at ?? "") || 0,
                        Date.parse(s.completed_at ?? "") || 0
                    )
                )
            );

            const bLast = Math.max(
                Date.parse(b.created_at ?? "") || 0,
                ...bSteps.map((s) =>
                    Math.max(
                        Date.parse(s.updated_at ?? "") || 0,
                        Date.parse(s.started_at ?? "") || 0,
                        Date.parse(s.paused_at ?? "") || 0,
                        Date.parse(s.completed_at ?? "") || 0
                    )
                )
            );

            // Most recent activity first
            return bLast - aLast;
        });
    }
    const listTitle = late ? "Late Jobs" : status ?? "Requests";

    return (
        <AppShell title="Requests" hideHeaderTitle>
            <div className="bg-neutral-900 rounded-lg shadow-lg p-6">
                <div className="mb-6">
                    <h2 className="text-2xl font-semibold text-neutral-100">
                        {listTitle}
                    </h2>

                    <form action="/requests" method="get" className="mt-4 flex items-center gap-2">
                        {/* Preserve existing filters */}
                        {status ? <input type="hidden" name="status" value={status} /> : null}
                        {late ? <input type="hidden" name="late" value={late} /> : null}

                        <input
                            type="text"
                            name="q"
                            defaultValue={q}
                            placeholder="Search customer name…"
                            className="w-full max-w-md h-10 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />

                        <button
                            type="submit"
                            className="inline-flex h-10 items-center justify-center rounded-md bg-neutral-800 px-4 text-sm font-medium text-neutral-100 hover:bg-neutral-700"
                        >
                            Search
                        </button>

                        {q.length > 0 ? (
                            <Link
                                href={
                                    status
                                        ? `/requests?status=${encodeURIComponent(status)}`
                                        : late
                                            ? `/requests?late=1`
                                            : `/requests`
                                }
                                className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-800 bg-transparent px-4 text-sm font-medium text-neutral-200 hover:bg-neutral-900/60"
                            >
                                Clear
                            </Link>
                        ) : null}
                    </form>


                    <div className="mt-4 border-b border-neutral-800" />
                </div>
                {error && (
                    <p className="text-sm text-red-400">
                        Error loading requests.
                    </p>
                )}

                {data && data.length === 0 && (
                    <ul className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950">
                        <li className="p-6 text-sm text-neutral-400 text-center">
                            {late
                                ? "No late jobs right now."
                                : status
                                    ? `No ${status.toLowerCase()} requests right now.`
                                    : "No requests yet."}
                        </li>
                    </ul>
                )}

                {data && data.length > 0 && (
                    <ul className="divide-y divide-neutral-800"
                    >
                        {data.map((req: RequestRow) => (
                            <li
                                key={req.id}
                                className="group relative p-4 rounded-lg border border-neutral-800 bg-neutral-950/40 transition-colors hover:bg-neutral-900/60 active:bg-neutral-900 focus-within:outline focus-within:outline-2 focus-within:outline-blue-500 focus-within:z-10"
                            >
                                <Link
                                    href={`/requests/${req.id}`}
                                    className="block w-full text-left cursor-pointer focus:outline-none"
                                >


                                    <div className="flex items-center justify-between gap-4">
                                        <div className="min-w-0">
                                            <p
                                                className="font-medium text-neutral-100 truncate"
                                                title={req.customer_name || "Unnamed customer"}
                                            >
                                                {req.customer_name || "Unnamed customer"}
                                            </p>


                                            <p
                                                className="text-sm text-neutral-400 truncate"
                                                title={(req.services_requested ?? []).join(", ") || "—"}
                                            >
                                                {(req.services_requested ?? []).join(", ") || "—"}
                                            </p>

                                            <p className="mt-1 text-xs text-neutral-500">
                                                {new Date(req.created_at).toLocaleString(undefined, {
                                                    dateStyle: "medium",
                                                    timeStyle: "short",
                                                })}
                                            </p>

                                            {req.job_deadline && (
                                                <p className="mt-1 text-xs text-neutral-500">
                                                    Due{" "}
                                                    {new Date(req.job_deadline).toLocaleString(undefined, {
                                                        dateStyle: "medium",
                                                        timeStyle: "short",
                                                    })}
                                                </p>
                                            )}


                                        </div>


                                        <div className="flex items-center gap-3">
                                            <span
                                                title={(() => {
                                                    const steps = Array.isArray((req as any).request_services)
                                                        ? ((req as any).request_services as any[])
                                                        : [];

                                                    const paused = steps.find((s) => s.step_status === "Waiting");

                                                    if (paused?.paused_at) {
                                                        const dt = new Date(paused.paused_at);
                                                        const date = dt.toLocaleDateString(undefined, {
                                                            month: "short",
                                                            day: "numeric",
                                                            year: "numeric",
                                                        });
                                                        const time = dt.toLocaleTimeString(undefined, {
                                                            hour: "numeric",
                                                            minute: "2-digit",
                                                        });

                                                        return `Paused ${date} at ${time}`;
                                                    }

                                                    return `Status: ${req.overall_status}`;
                                                })()}
                                                className={(() => {
                                                    const steps = Array.isArray((req as any).request_services)
                                                        ? ((req as any).request_services as any[])
                                                        : [];
                                                    const hasPaused = steps.some((s) => s.step_status === "Waiting");

                                                    return hasPaused
                                                        ? "inline-flex shrink-0 items-center justify-center text-xs leading-none rounded-full px-2 py-1 border border-amber-700/60 bg-amber-950/30 text-amber-200"
                                                        : "inline-flex shrink-0 items-center justify-center text-xs leading-none rounded-full px-2 py-1 border bg-neutral-800 text-neutral-300 border-neutral-700";
                                                })()}
                                            >
                                                {(() => {
                                                    const steps = Array.isArray((req as any).request_services)
                                                        ? ((req as any).request_services as any[])
                                                            .slice()
                                                            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                                                        : [];

                                                    const active = steps.find((s) => s.step_status === "In Progress");
                                                    const paused = steps.find((s) => s.step_status === "Waiting");
                                                    const next = steps.find((s) => s.step_status === "Not Started");

                                                    if (active) return `${active.service_type} In Progress`;
                                                    if (paused) return `${paused.service_type} Paused`;
                                                    if ((req.overall_status === "In Progress" || req.overall_status === "Waiting") && next)
                                                        return `Waiting to Start ${next.service_type}`;

                                                    return req.overall_status;
                                                })()}
                                            </span>

                                            <span className="text-neutral-600 text-sm opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5 group-focus-within:opacity-100 group-focus-within:translate-x-0.5">
                                                ›
                                            </span>
                                        </div>

                                    </div>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}

            </div>
        </AppShell>
    );
}
