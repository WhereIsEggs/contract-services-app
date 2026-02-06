import AppShell from "@/app/components/AppShell";
import { createClient } from "@/app/lib/supabase/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export default async function QuoteDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    if (!id) notFound();

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const { data: quote, error } = await supabase
        .from("quotes")
        .select(
            `
      id,
      created_at,
      customer_name,
      job_name,
      print_time_hours,
      material1_id,
      material1_grams,
      material2_id,
      material2_grams,
      notes,
      material1:material_costs!quotes_material1_id_fkey ( id, name, category ),
      material2:material_costs!quotes_material2_id_fkey ( id, name, category )
    `
        )
        .eq("id", id)
        .single();

    if (error || !quote) notFound();

    const m1 = (quote as any).material1;
    const m2 = (quote as any).material2;

    return (
        <AppShell title="Quote Detail">
            <div className="mx-auto w-full max-w-3xl">
                <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold">Quote Detail</h1>
                        <p className="mt-1 text-sm text-neutral-400">
                            Skeleton detail view (pricing/calculation comes later).
                        </p>
                    </div>

                    <Link
                        href="/quotes"
                        className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-800 bg-neutral-950 px-4 text-sm font-medium text-neutral-200 hover:bg-neutral-900"
                    >
                        Back
                    </Link>
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 shadow-sm">
                    <div className="grid gap-4 text-sm text-neutral-200">
                        <div>
                            <span className="text-neutral-400">Created</span>
                            <div className="font-medium">
                                {new Date((quote as any).created_at).toLocaleString()}
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <span className="text-neutral-400">Customer</span>
                                <div className="font-medium">{(quote as any).customer_name}</div>
                            </div>

                            <div>
                                <span className="text-neutral-400">Job</span>
                                <div className="font-medium">{(quote as any).job_name}</div>
                            </div>
                        </div>

                        <div>
                            <span className="text-neutral-400">Print time (hours)</span>
                            <div className="font-medium">{Number((quote as any).print_time_hours ?? 0).toFixed(2)}</div>
                        </div>

                        <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                            <div className="mb-2 text-sm font-semibold text-neutral-100">Materials</div>

                            <div className="grid gap-3">
                                <div className="grid gap-1">
                                    <div className="text-xs text-neutral-400">Material 1</div>
                                    <div className="text-neutral-200">
                                        {m1
                                            ? `${m1.category ? `${m1.category} — ` : ""}${m1.name}`
                                            : "—"}
                                        {" · "}
                                        {Number((quote as any).material1_grams ?? 0).toFixed(2)} g
                                    </div>
                                </div>

                                <div className="grid gap-1">
                                    <div className="text-xs text-neutral-400">Material 2</div>
                                    <div className="text-neutral-200">
                                        {m2
                                            ? `${m2.category ? `${m2.category} — ` : ""}${m2.name}`
                                            : "—"}
                                        {" · "}
                                        {Number((quote as any).material2_grams ?? 0).toFixed(2)} g
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <span className="text-neutral-400">Notes</span>
                            <div className="mt-1 whitespace-pre-wrap text-neutral-200">
                                {(quote as any).notes || "—"}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AppShell>
    );
}
