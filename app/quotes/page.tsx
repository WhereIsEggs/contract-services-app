import AppShell from "@/app/components/AppShell";
import { createClient } from "@/app/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

type QuoteRow = {
    id: string;
    created_at: string;
    customer_name: string;
    job_name: string;
};

export default async function QuotesPage() {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const { data: quotes, error } = await supabase
        .from("quotes")
        .select("id,created_at,customer_name,job_name")
        .order("created_at", { ascending: false })
        .limit(50);

    return (
        <AppShell title="Quote Tool">
            <div className="mx-auto w-full max-w-6xl">
                <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold">Quote Tool</h1>
                        <p className="mt-1 text-sm text-neutral-400">
                            Recent quotes (list view). Detail/edit/attach-to-request comes next.
                        </p>
                    </div>

                    <Link
                        href="/quotes/new"
                        className="inline-flex h-10 items-center justify-center rounded-md bg-white px-4 text-sm font-medium text-neutral-900 hover:bg-neutral-200"
                    >
                        New Quote
                    </Link>
                </div>

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
                                <th className="px-3 py-2">Created</th>
                                <th className="px-3 py-2">Customer</th>
                                <th className="px-3 py-2">Job</th>
                                <th className="px-3 py-2 text-right">View</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-neutral-800 bg-neutral-950/30">
                            {(quotes ?? []).length === 0 ? (
                                <tr>
                                    <td className="px-3 py-4 text-neutral-400" colSpan={4}>
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <span>No quotes yet.</span>
                                            <Link
                                                href="/quotes/new"
                                                className="inline-flex h-9 items-center justify-center rounded-md bg-white px-3 text-sm font-medium text-neutral-900 hover:bg-neutral-200"
                                            >
                                                New Quote
                                            </Link>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                (quotes ?? []).map((q: QuoteRow) => (
                                    <tr key={q.id} className="align-top">
                                        <td className="px-3 py-2 text-neutral-200">
                                            {new Date(q.created_at).toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2 text-neutral-200">{q.customer_name}</td>
                                        <td className="px-3 py-2 text-neutral-200">{q.job_name}</td>
                                        <td className="px-3 py-2 text-right">
                                            <Link
                                                href={`/quotes/${q.id}`}
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
            </div>
        </AppShell>
    );
}
