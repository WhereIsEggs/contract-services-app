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
      notes,
      quote_items (
        id,
        created_at,
        service_type,
        labor_hours,
        print_time_hours,
        params
      )
    `
        )
        .eq("id", id)
        .single();

    if (error || !quote) notFound();

    const items = ((quote as any).quote_items ?? []) as any[];

    const contractItem =
        items.find((i) => i.service_type === "CONTRACT_PRINTING") ?? null;

    const p = (contractItem?.params ?? {}) as any;

    const materialIds = [p.material1_id, p.material2_id].filter(Boolean) as string[];

    const { data: materials } =
        materialIds.length > 0
            ? await supabase
                .from("material_costs")
                .select("id,name,category,price_per_lb")
                .in("id", materialIds)
            : { data: [] as any[] };

    const materialById = new Map<string, any>(
        (materials ?? []).map((m: any) => [String(m.id), m])
    );

    const mat1 = p.material1_id ? materialById.get(p.material1_id) : null;
    const mat2 = p.material2_id ? materialById.get(p.material2_id) : null;

    const scanningItem = items.find((i) => i.service_type === "3D_SCANNING") ?? null;
    const designItem = items.find((i) => i.service_type === "3D_DESIGN") ?? null;
    const testingItem = items.find((i) => i.service_type === "MATERIAL_TESTING") ?? null;

    const rateScanning = 250;
    const rateDesign = 150;
    const rateTesting = 250;

    const contractTotal = Number(p?.calc?.V2_totalWithExternalLabor ?? 0);

    const scanningTotal = scanningItem
        ? Number(scanningItem.labor_hours ?? 0) * rateScanning
        : 0;

    const designTotal = designItem
        ? Number(designItem.labor_hours ?? 0) * rateDesign
        : 0;

    const testingTotal = testingItem
        ? Number(testingItem.labor_hours ?? 0) * rateTesting
        : 0;

    const grandTotal = contractTotal + scanningTotal + designTotal + testingTotal;


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

                        {/* Contract Printing (if present) */}
                        <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                            <div className="mb-2 text-sm font-semibold text-neutral-100">
                                Contract Printing
                            </div>

                            {contractItem ? (
                                <div className="grid gap-3">
                                    <div className="grid gap-1">
                                        <div className="text-xs text-neutral-400">Print time (hours)</div>
                                        <div className="text-neutral-200">
                                            {Number((contractItem as any).print_time_hours ?? 0).toFixed(2)}
                                        </div>
                                    </div>

                                    <div className="grid gap-2">
                                        <div className="text-xs text-neutral-400">Materials</div>

                                        <div className="text-neutral-200">
                                            <span className="text-neutral-400">Material 1:</span>{" "}
                                            {mat1
                                                ? `${mat1.category ? `${mat1.category} — ` : ""}${mat1.name}`
                                                : p.material1_id
                                                    ? "Unknown material"
                                                    : "—"}
                                            {" · "}
                                            {Number(p.material1_grams ?? 0).toFixed(0)} g
                                        </div>

                                        <div className="text-neutral-200">
                                            <span className="text-neutral-400">Material 2:</span>{" "}
                                            {mat2
                                                ? `${mat2.category ? `${mat2.category} — ` : ""}${mat2.name}`
                                                : p.material2_id
                                                    ? "Unknown material"
                                                    : "—"}
                                            {" · "}
                                            {Number(p.material2_grams ?? 0).toFixed(0)} g
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-sm text-neutral-500">No contract printing item on this quote.</div>
                            )}
                        </div>


                        {/* Line items (PO-style) */}
                        <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                            <div className="mb-2 text-sm font-semibold text-neutral-100">
                                Line items
                            </div>

                            <div className="grid gap-2 text-sm">
                                {contractItem && (
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="font-medium text-neutral-200">
                                                Contract Printing
                                            </div>
                                            <div className="text-xs text-neutral-400">
                                                {Number((contractItem as any).print_time_hours ?? 0).toFixed(2)} hrs ·{" "}
                                                {Number(p.material1_grams ?? 0).toFixed(0)} g
                                                {p.material2_grams ? ` + ${Number(p.material2_grams ?? 0).toFixed(0)} g` : ""}
                                            </div>
                                        </div>
                                        <div className="shrink-0 font-semibold text-neutral-200">
                                            ${contractTotal.toFixed(2)}
                                        </div>
                                    </div>
                                )}

                                {scanningItem && (
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="font-medium text-neutral-200">
                                                3D Scanning
                                            </div>
                                            <div className="text-xs text-neutral-400">
                                                {Number(scanningItem.labor_hours ?? 0).toFixed(2)} hrs · ${rateScanning}/hr
                                            </div>
                                        </div>
                                        <div className="shrink-0 font-semibold text-neutral-200">
                                            ${scanningTotal.toFixed(2)}
                                        </div>
                                    </div>
                                )}

                                {designItem && (
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="font-medium text-neutral-200">
                                                3D Design
                                            </div>
                                            <div className="text-xs text-neutral-400">
                                                {Number(designItem.labor_hours ?? 0).toFixed(2)} hrs · ${rateDesign}/hr
                                            </div>
                                        </div>
                                        <div className="shrink-0 font-semibold text-neutral-200">
                                            ${designTotal.toFixed(2)}
                                        </div>
                                    </div>
                                )}

                                {testingItem && (
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="font-medium text-neutral-200">
                                                Material Testing
                                            </div>
                                            <div className="text-xs text-neutral-400">
                                                {Number(testingItem.labor_hours ?? 0).toFixed(2)} hrs · ${rateTesting}/hr
                                            </div>
                                        </div>
                                        <div className="shrink-0 font-semibold text-neutral-200">
                                            ${testingTotal.toFixed(2)}
                                        </div>
                                    </div>
                                )}

                                <div className="my-2 border-t border-neutral-800" />

                                <div className="flex items-center justify-between">
                                    <div className="text-sm font-semibold text-neutral-100">Total</div>
                                    <div className="text-lg font-semibold text-neutral-100">
                                        ${grandTotal.toFixed(2)}
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

