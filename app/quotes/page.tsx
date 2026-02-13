import AppShell from "@/app/components/AppShell";
import { createClient } from "@/app/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

type QuoteRow = {
    id: string;
    created_at: string;
    customer_name: string;
};

export default async function QuotesPage({
    searchParams,
}: {
    searchParams?: Promise<{
        q?: string;
        sort?: string;
        dir?: string;
        page?: string;
    }>;
}) {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const sp = await searchParams;

    const q = String(sp?.q ?? "").trim();
    const sort = String(sp?.sort ?? "request").toLowerCase();
    const dir = String(sp?.dir ?? "desc").toLowerCase();

    const ascending = dir === "asc";

    const page = Math.max(1, Number(sp?.page ?? "1") || 1);
    const pageSize = 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize; // inclusive range (fetches 51 rows)


    const nextDir = (col: string) => {
        // if clicking the same column, toggle; otherwise default to desc
        if (sort === col) return ascending ? "desc" : "asc";
        return "desc";
    };

    const sortHref = (col: string) => {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        params.set("sort", col);
        params.set("dir", nextDir(col));
        return `/quotes?${params.toString()}`;
    };

    const sortIndicator = (col: string) => {
        if (sort !== col) return "";
        return ascending ? " ▲" : " ▼";
    };


    let query = supabase
        .from("quotes")
        .select("id,created_at,customer_name,job_name")
        .order("created_at", { ascending: false })
        .range(from, to);


    if (q) {
        // search customer_name OR job_name (case-insensitive)
        query = query.or(`customer_name.ilike.%${q}%,job_name.ilike.%${q}%`);
    }

    const { data: quotes, error } = await query;

    const quoteIds = (quotes ?? []).map((q: any) => String(q.id)).filter(Boolean);

    const { data: requestRows } =
        quoteIds.length > 0
            ? await supabase
                .from("requests")
                .select("id, quote_id, request_number")
                .in("quote_id", quoteIds)
            : { data: [] as any[] };

    const requestByQuoteId = new Map<string, any>(
        (requestRows ?? []).map((r: any) => [String(r.quote_id), r])
    );

    // Build a row model that includes request_number for sorting/display
    type Row = {
        id: string;
        created_at: string;
        customer_name: string;
        request_number: number | null;
    };

    const rows: Row[] = (quotes ?? []).map((q: any) => {
        const req = requestByQuoteId.get(String(q.id));
        const n = Number(req?.request_number);
        return {
            id: String(q.id),
            created_at: String(q.created_at),
            customer_name: String(q.customer_name ?? ""),
            request_number: Number.isFinite(n) ? n : null,
        };
    });

    // Sort in-memory (because request_number is not on quotes)
    rows.sort((a, b) => {
        const dirMul = ascending ? 1 : -1;

        if (sort === "customer") {
            return dirMul * a.customer_name.localeCompare(b.customer_name);
        }

        if (sort === "created") {
            const ta = new Date(a.created_at).getTime();
            const tb = new Date(b.created_at).getTime();
            return dirMul * (ta - tb);
        }

        // default: sort by request_number (nulls last)
        const ra = a.request_number;
        const rb = b.request_number;

        if (ra == null && rb == null) return 0;
        if (ra == null) return 1; // nulls last
        if (rb == null) return -1;

        return dirMul * (ra - rb);
    });

    const hasNext = rows.length > pageSize;
    const pageRows = rows.slice(0, pageSize);


    return (
        <AppShell title="Quotes" hideHeaderTitle>
            <div className="mx-auto w-full max-w-6xl">
                <div className="mb-6">
                    <div>
                        <h1 className="text-2xl font-semibold">Quotes</h1>
                    </div>
                </div>

                <form action="/quotes" method="get" className="mb-4 flex gap-2">
                    <input
                        name="q"
                        defaultValue={q}
                        placeholder="Search customer or job…"
                        className="h-10 w-full max-w-md rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                        type="submit"
                        className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-800 bg-neutral-950 px-4 text-sm font-medium text-neutral-200 hover:bg-neutral-900"
                    >
                        Search
                    </button>
                    {q ? (
                        <Link
                            href="/quotes"
                            className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-800 bg-neutral-950 px-4 text-sm font-medium text-neutral-200 hover:bg-neutral-900"
                        >
                            Clear
                        </Link>
                    ) : null}
                </form>


                {error && (
                    <div className="mb-6 rounded-md border border-red-900/40 bg-red-950/20 p-3 text-sm text-red-200">
                        <div className="font-medium">Supabase error</div>
                        <div className="mt-1 whitespace-pre-wrap text-red-200/90">{error.message}</div>
                    </div>
                )}

                <div className="overflow-hidden rounded-xl border border-neutral-800">
                    <table className="w-full text-sm">
                        <thead className="bg-neutral-950/60 text-left text-neutral-300">
                            <tr className="border-b border-neutral-800">
                                <th className="px-3 py-2">
                                    <Link href={sortHref("request")} className="hover:text-white">
                                        Request ID{sortIndicator("request")}
                                    </Link>
                                </th>
                                <th className="px-3 py-2">
                                    <Link href={sortHref("customer")} className="hover:text-white">
                                        Customer{sortIndicator("customer")}
                                    </Link>
                                </th>
                                <th className="px-3 py-2">
                                    <Link href={sortHref("created")} className="hover:text-white">
                                        Created{sortIndicator("created")}
                                    </Link>
                                </th>
                                <th className="px-3 py-2 text-right">View</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-neutral-800 bg-neutral-950/30">
                            {pageRows.length === 0 ? (
                                <tr>
                                    <td className="px-3 py-4 text-neutral-400" colSpan={4}>
                                        No quotes yet.
                                    </td>
                                </tr>
                            ) : (
                                pageRows.map((r) => (
                                    <tr key={r.id} className="align-top">
                                        <td className="px-3 py-2 text-neutral-200">
                                            <div className="flex items-center gap-2">
                                                <span>
                                                    {r.request_number != null ? String(r.request_number).padStart(5, "0") : "—"}
                                                </span>

                                                {r.request_number != null ? (
                                                    <span className="rounded-full border border-emerald-900/50 bg-emerald-950/30 px-2 py-0.5 text-[11px] text-emerald-200">
                                                        Linked
                                                    </span>
                                                ) : (
                                                    <span className="rounded-full border border-neutral-800 bg-neutral-950/40 px-2 py-0.5 text-[11px] text-neutral-300">
                                                        Standalone
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        <td className="px-3 py-2 text-neutral-200">{r.customer_name}</td>

                                        <td className="px-3 py-2 text-neutral-200">
                                            {new Date(r.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <Link
                                                href={`/quotes/${r.id}`}
                                                className="inline-flex h-9 items-center justify-center rounded-md border border-neutral-800 bg-neutral-950 px-3 text-xs text-neutral-200 hover:bg-neutral-900"
                                            >
                                                View
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="mt-4 flex items-center justify-between">
                    <div className="text-xs text-neutral-500">Page {page}</div>

                    <div className="flex gap-2">
                        {page > 1 ? (
                            <Link
                                href={`/quotes?${new URLSearchParams({
                                    ...(q ? { q } : {}),
                                    sort,
                                    dir,
                                    page: String(page - 1),
                                }).toString()}`}
                                className="inline-flex h-9 items-center justify-center rounded-md border border-neutral-800 bg-neutral-950 px-3 text-xs text-neutral-200 hover:bg-neutral-900"
                            >
                                Prev
                            </Link>
                        ) : (
                            <span className="inline-flex h-9 items-center justify-center rounded-md border border-neutral-800 bg-neutral-950 px-3 text-xs text-neutral-500 opacity-60">
                                Prev
                            </span>
                        )}

                        {hasNext ? (
                            <Link
                                href={`/quotes?${new URLSearchParams({
                                    ...(q ? { q } : {}),
                                    sort,
                                    dir,
                                    page: String(page + 1),
                                }).toString()}`}
                                className="inline-flex h-9 items-center justify-center rounded-md border border-neutral-800 bg-neutral-950 px-3 text-xs text-neutral-200 hover:bg-neutral-900"
                            >
                                Next
                            </Link>
                        ) : (
                            <span className="inline-flex h-9 items-center justify-center rounded-md border border-neutral-800 bg-neutral-950 px-3 text-xs text-neutral-500 opacity-60">
                                Next
                            </span>
                        )}
                    </div>
                </div>

            </div>
        </AppShell>
    );
}
