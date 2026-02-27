import { createClient } from "../lib/supabase/server";
import { redirect } from "next/navigation";
import AppShell from "../components/AppShell";
import Link from "next/link";



type RequestRow = {
    id: string;
    request_number: number | null;
    created_at: string;
    customer_name: string | null;
    services_requested: string[] | null;
    overall_status: string;
    job_deadline: string | null;
};


export default async function RequestsPage({
    searchParams,
}: {
    searchParams?: Promise<{ status?: string; late?: string; q?: string; sort?: string; dir?: string; page?: string }>;
}) {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }
    const sp = await searchParams;
    const { status: rawStatus, late, q: rawQ, sort: rawSort, dir: rawDir, page: rawPage } = sp ?? {};
    const q = (rawQ ?? "").trim();
    const page = Math.max(1, Number(rawPage ?? "1") || 1);
    const pageSize = 25;

    const normalizedStatus = (rawStatus ?? "").trim().replace(/:$/, "");
    const allowedStatuses = new Set(["In Progress", "Completed"]);
    const status = allowedStatuses.has(normalizedStatus) ? normalizedStatus : undefined;

    const allowedSorts = new Set(["request", "customer", "created"]);
    const requestedSort = String(rawSort ?? "").toLowerCase();
    const defaultSort = "request";
    const sort = allowedSorts.has(requestedSort) ? requestedSort : defaultSort;

    const requestedDir = String(rawDir ?? "").toLowerCase();
    const defaultDir = "desc";
    const dir = requestedDir === "asc" || requestedDir === "desc" ? requestedDir : defaultDir;
    const ascending = dir === "asc";

    const nextDir = (col: string) => {
        if (sort === col) return ascending ? "desc" : "asc";
        return "desc";
    };

    const sortHref = (col: string) => {
        const params = new URLSearchParams();
        if (status) params.set("status", status);
        if (late) params.set("late", late);
        if (q) params.set("q", q);
        params.set("sort", col);
        params.set("dir", nextDir(col));
        params.set("page", "1");
        return `/requests?${params.toString()}`;
    };

    const buildListHref = (overrides?: {
        page?: number;
        clearQ?: boolean;
        sort?: string;
        dir?: string;
    }) => {
        const params = new URLSearchParams();
        if (status) params.set("status", status);
        if (late) params.set("late", late);
        if (!overrides?.clearQ && q) params.set("q", q);
        params.set("sort", overrides?.sort ?? sort);
        params.set("dir", overrides?.dir ?? dir);

        const nextPage = Math.max(1, overrides?.page ?? page);
        params.set("page", String(nextPage));

        return `/requests?${params.toString()}`;
    };

    const sortIndicator = (col: string) => {
        if (sort !== col) return "";
        return ascending ? " ▲" : " ▼";
    };

    let query = supabase
        .from("requests")
        .select(`
  id,
    request_number,
  created_at,
  customer_name,
  services_requested,
  overall_status,
    job_deadline,
  request_services (
        id,
    service_type,
    step_status,
    sort_order,
    started_at,
    paused_at,
    completed_at,
    updated_at
  )
`)
                .order("created_at", { ascending: false });

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
        query = query.neq("overall_status", "Completed");
    } else {
        const sortColumn =
            sort === "request"
                ? "request_number"
                : sort === "customer"
                    ? "customer_name"
                    : "created_at";

        const from = (page - 1) * pageSize;
        const to = from + pageSize; // fetch one extra row to detect next page

        query = query
            .order(sortColumn, { ascending })
            .range(from, to);
    }

    const { data: rawData, error } = await query.returns<RequestRow[]>();

    let data = rawData ?? [];

    const stepIds = data.flatMap((req: any) =>
        Array.isArray(req.request_services)
            ? (req.request_services as any[]).map((s: any) => String(s.id ?? "")).filter(Boolean)
            : []
    );

    const { data: actualRows } = stepIds.length
        ? await supabase
            .from("service_actuals")
            .select("service_id, data")
            .in("service_id", stepIds)
        : { data: [] as any[] };

    const leadByServiceId = new Map<string, any>(
        (actualRows ?? []).map((r: any) => [String(r.service_id), (r?.data as any)?.lead_time ?? null])
    );

    const nowMs = Date.now();
    const lateServicesByRequestId = new Map<string, string[]>();

    for (const req of data as any[]) {
        const steps = Array.isArray(req.request_services) ? (req.request_services as any[]) : [];
        const lateServices = steps
            .filter((s) => String(s.step_status ?? "") !== "Completed")
            .filter((s) => {
                const lead = leadByServiceId.get(String(s.id ?? ""));
                const dueMs = lead?.due_at ? Date.parse(String(lead.due_at)) : NaN;
                return Number.isFinite(dueMs) && dueMs < nowMs;
            })
            .map((s) => String(s.service_type ?? ""));

        if (lateServices.length > 0) {
            lateServicesByRequestId.set(String(req.id), lateServices);
        }
    }

    const sortRows = (rows: any[]) => rows.slice().sort((a: any, b: any) => {
        if (sort === "request") {
            const aNum = Number.isFinite(Number(a.request_number)) ? Number(a.request_number) : null;
            const bNum = Number.isFinite(Number(b.request_number)) ? Number(b.request_number) : null;

            if (aNum == null && bNum == null) return 0;
            if (aNum == null) return 1;
            if (bNum == null) return -1;

            return ascending ? aNum - bNum : bNum - aNum;
        }

        if (sort === "customer") {
            const aName = String(a.customer_name ?? "");
            const bName = String(b.customer_name ?? "");
            return ascending ? aName.localeCompare(bName) : bName.localeCompare(aName);
        }

        if (sort === "created") {
            const aTs = Date.parse(a.created_at ?? "") || 0;
            const bTs = Date.parse(b.created_at ?? "") || 0;
            return ascending ? aTs - bTs : bTs - aTs;
        }

        return 0;
    });

    let hasNext = false;

    if (late) {
        const filtered = data.filter((req: any) => lateServicesByRequestId.has(String(req.id)));
        const sorted = sortRows(filtered);
        const from = (page - 1) * pageSize;
        const to = from + pageSize;
        hasNext = to < sorted.length;
        data = sorted.slice(from, to);
    } else {
        const sorted = sortRows(data);
        hasNext = sorted.length > pageSize;
        data = sorted.slice(0, pageSize);
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
                        {sort ? <input type="hidden" name="sort" value={sort} /> : null}
                        {dir ? <input type="hidden" name="dir" value={dir} /> : null}

                        <input
                            type="text"
                            name="q"
                            defaultValue={q}
                            placeholder="Search customer name…"
                            className="w-full max-w-md h-10 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />

                        <input type="hidden" name="page" value="1" />

                        <button
                            type="submit"
                            className="inline-flex h-10 items-center justify-center rounded-md bg-neutral-800 px-4 text-sm font-medium text-neutral-100 hover:bg-neutral-700"
                        >
                            Search
                        </button>

                        {q.length > 0 ? (
                            <Link
                                href={buildListHref({ page: 1, clearQ: true })}
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

                <div className="overflow-x-auto rounded-xl border border-neutral-700">
                    <table className="w-full table-fixed text-sm">
                        <thead className="bg-neutral-950/60 text-left text-neutral-300">
                            <tr className="border-b border-neutral-700">
                                <th className="w-[13%] px-3 py-2">
                                    <Link href={sortHref("request")} className="hover:text-white">
                                        Request ID{sortIndicator("request")}
                                    </Link>
                                </th>
                                <th className="w-[20%] px-3 py-2">
                                    <Link href={sortHref("customer")} className="hover:text-white">
                                        Customer{sortIndicator("customer")}
                                    </Link>
                                </th>
                                <th className="w-[18%] px-3 py-2">Status</th>
                                <th className="w-[27%] px-3 py-2">Services</th>
                                <th className="w-[12%] px-3 py-2">
                                    <Link href={sortHref("created")} className="hover:text-white">
                                        Created{sortIndicator("created")}
                                    </Link>
                                </th>
                                <th className="w-[10%] px-3 py-2 text-right">View</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-neutral-700 bg-neutral-950/30">
                            {data.length === 0 ? (
                                <tr>
                                    <td className="px-3 py-4 text-neutral-400" colSpan={6}>
                                        {late
                                            ? "No late jobs right now."
                                            : status
                                                ? `No ${status.toLowerCase()} requests right now.`
                                                : "No requests yet."}
                                    </td>
                                </tr>
                            ) : (
                                data.map((req: RequestRow) => {
                                    const steps = Array.isArray((req as any).request_services)
                                        ? ((req as any).request_services as any[])
                                            .slice()
                                            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                                        : [];

                                    const active = steps.find((s) => s.step_status === "In Progress");
                                    const paused = steps.find((s) => s.step_status === "Waiting");
                                    const next = steps.find((s) => s.step_status === "Not Started");
                                    const lateServices = lateServicesByRequestId.get(String(req.id)) ?? [];

                                    const statusLabel = (() => {
                                        if (lateServices.length > 0) {
                                            const preview = lateServices.slice(0, 2).join(", ");
                                            const more = lateServices.length > 2 ? ` +${lateServices.length - 2}` : "";
                                            return `Late: ${preview}${more}`;
                                        }
                                        if (active) return `${active.service_type} In Progress`;
                                        if (paused) return `${paused.service_type} Paused`;
                                        if ((req.overall_status === "In Progress" || req.overall_status === "Waiting") && next) {
                                            return `Waiting to Start ${next.service_type}`;
                                        }
                                        return req.overall_status;
                                    })();

                                    const statusClass = lateServices.length > 0
                                        ? "rounded-full border border-red-700/60 bg-red-950/30 px-2 py-0.5 text-[11px] text-red-200"
                                        : paused
                                            ? "rounded-full border border-amber-700/60 bg-amber-950/30 px-2 py-0.5 text-[11px] text-amber-200"
                                            : "rounded-full border border-neutral-700 bg-neutral-950/40 px-2 py-0.5 text-[11px] text-neutral-300";

                                    return (
                                        <tr key={req.id} className="align-top">
                                            <td className="px-3 py-2 text-neutral-200">
                                                {req.request_number != null ? String(req.request_number).padStart(5, "0") : "—"}
                                            </td>

                                            <td className="px-3 py-2 text-neutral-200">
                                                <div className="truncate">{req.customer_name || "Unnamed customer"}</div>
                                            </td>

                                            <td className="px-3 py-2">
                                                <span className={`inline-flex max-w-full items-center truncate ${statusClass}`} title={statusLabel}>
                                                    {statusLabel}
                                                </span>
                                            </td>

                                            <td className="px-3 py-2">
                                                <div className="grid grid-cols-2 gap-1">
                                                    {(req.services_requested ?? []).length > 0 ? (
                                                        (req.services_requested ?? []).map((service, index) => (
                                                            <span
                                                                key={`${req.id}-${service}-${index}`}
                                                                title={service}
                                                                className="min-w-0 truncate rounded-md border border-neutral-700 bg-neutral-950/40 px-2 py-1 text-xs text-neutral-300"
                                                            >
                                                                {service}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-xs text-neutral-500">—</span>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="px-3 py-2 text-neutral-200">
                                                {new Date(req.created_at).toLocaleDateString()}
                                            </td>

                                            <td className="px-3 py-2 text-right">
                                                <Link
                                                    href={`/requests/${req.id}`}
                                                    className="inline-flex h-9 items-center justify-center rounded-md border border-neutral-700 bg-neutral-950 px-3 text-xs text-neutral-200 hover:bg-neutral-900"
                                                >
                                                    View
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="mt-4 flex items-center justify-between">
                    <div className="text-xs text-neutral-500">Page {page}</div>

                    <div className="flex gap-2">
                        {page > 1 ? (
                            <Link
                                href={buildListHref({ page: page - 1 })}
                                className="inline-flex h-9 items-center justify-center rounded-md border border-neutral-700 bg-neutral-950 px-3 text-xs text-neutral-200 hover:bg-neutral-900"
                            >
                                Prev
                            </Link>
                        ) : (
                            <span className="inline-flex h-9 items-center justify-center rounded-md border border-neutral-700 bg-neutral-950 px-3 text-xs text-neutral-500 opacity-60">
                                Prev
                            </span>
                        )}

                        {hasNext ? (
                            <Link
                                href={buildListHref({ page: page + 1 })}
                                className="inline-flex h-9 items-center justify-center rounded-md border border-neutral-700 bg-neutral-950 px-3 text-xs text-neutral-200 hover:bg-neutral-900"
                            >
                                Next
                            </Link>
                        ) : (
                            <span className="inline-flex h-9 items-center justify-center rounded-md border border-neutral-700 bg-neutral-950 px-3 text-xs text-neutral-500 opacity-60">
                                Next
                            </span>
                        )}
                    </div>
                </div>

            </div>
        </AppShell>
    );
}
