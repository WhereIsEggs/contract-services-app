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
};


export default async function RequestsPage({
    searchParams,
}: {
    searchParams?: Promise<{ status?: string; late?: string }>;
}) {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }
    const sp = await searchParams;
    const { status, late } = sp ?? {};

    let query = supabase
        .from("requests")
        .select("id, created_at, customer_name, services_requested, overall_status")
        .order("created_at", { ascending: false })
        .limit(10);

    if (status) {
        query = query.eq("overall_status", status);
    }

    const { data, error } = await query.returns<RequestRow[]>();
    const listTitle = late
        ? "Late Jobs"
        : status
            ? `${status} Requests`
            : "Requests";

    return (
        <AppShell title="Requests" hideHeaderTitle>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 shadow-sm">
                {/* keep logout, but make it a simple top-right action */}
                {user && (
                    <div className="mb-4 flex justify-end">
                        <form method="POST" action="/auth/logout">
                            <button
                                type="submit"
                                className="text-sm text-neutral-300 hover:text-white underline"
                            >
                                Log out
                            </button>
                        </form>
                    </div>
                )}
                <div className="mb-6">
                    <h2 className="text-2xl font-semibold text-neutral-100">
                        {listTitle}
                    </h2>
                </div>
                {error && (
                    <p className="text-sm text-red-400">
                        Error loading requests.
                    </p>
                )}

                {data && data.length === 0 && (
                    <ul className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950">
                        <li className="p-6 text-sm text-neutral-400 text-center">
                            No requests yet.
                        </li>
                    </ul>
                )}

                {data && data.length > 0 && (
                    <ul className="divide-y divide-neutral-800"
                    >
                        {data.map((req: RequestRow) => (
                            <li
                                key={req.id}
                                className="group relative p-4 transition-colors hover:bg-neutral-800/50 active:bg-neutral-800 focus-within:outline focus-within:outline-2 focus-within:outline-blue-500 rounded-lg focus-within:z-10 focus-within:bg-neutral-900/60"
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


                                        </div>


                                        <div className="flex items-center gap-3">
                                            <span
                                                title={`Status: ${req.overall_status}`}
                                                className={
                                                    "inline-flex shrink-0 items-center justify-center text-xs leading-none rounded-full px-2 py-1 border " +
                                                    (req.overall_status === "New"
                                                        ? "bg-blue-600/20 text-blue-200 border-blue-600/30"
                                                        : "bg-neutral-800 text-neutral-300 border-neutral-700")
                                                }
                                            >
                                                {req.overall_status}
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
