import AppShell from "@/app/components/AppShell";
import { createClient } from "@/app/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import QuoteFormClient from "./QuoteFormClient";



type MaterialOption = {
    id: string;
    name: string;
    category: string | null;
    is_active: boolean;
};

export default async function NewQuotePage({
    searchParams,
}: {
    searchParams?: Promise<{ msg?: string; err?: string }>;
}) {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const sp = await searchParams;

    const { data: materials, error } = await supabase
        .from("material_costs")
        .select("id,name,category,is_active")
        .eq("is_active", true)
        .order("category", { ascending: true })
        .order("name", { ascending: true });

    return (
        <AppShell title="New Quote">
            <div className="mx-auto w-full max-w-3xl">
                <div className="mb-6">
                    <h1 className="text-2xl font-semibold">New Quote</h1>
                    <p className="mt-1 text-sm text-neutral-400">
                        Skeleton quote entry (store inputs now; pricing logic later). Supports multiple services via line items.
                    </p>
                </div>

                {sp?.msg && (
                    <div className="mb-6 rounded-md border border-emerald-900/40 bg-emerald-950/20 p-3 text-sm text-emerald-200">
                        {sp.msg}
                    </div>
                )}
                {sp?.err && (
                    <div className="mb-6 rounded-md border border-red-900/40 bg-red-950/20 p-3 text-sm text-red-200">
                        {sp.err}
                    </div>
                )}

                {error && (
                    <div className="mb-6 rounded-md border border-red-900/40 bg-red-950/20 p-3 text-sm text-red-200">
                        <div className="font-medium">Supabase error</div>
                        <div className="mt-1 whitespace-pre-wrap text-red-200/90">{error.message}</div>
                    </div>
                )}

                <QuoteFormClient materials={(materials ?? []) as any} action={createQuote} />
            </div>
        </AppShell>
    );
}

/* =========================
   Server Action
========================= */

async function createQuote(formData: FormData) {
    "use server";
    const supabase = await createClient();

    try {
        const customer_name = String(formData.get("customer_name") ?? "").trim();
        const job_name = String(formData.get("job_name") ?? "").trim();
        const notes_raw = String(formData.get("notes") ?? "").trim();

        if (!customer_name) throw new Error("Customer name is required.");
        if (!job_name) throw new Error("Job name is required.");

        // Service toggles
        const svc_contract_printing = formData.get("svc_contract_printing") === "on";
        const svc_3d_scanning = formData.get("svc_3d_scanning") === "on";
        const svc_3d_design = formData.get("svc_3d_design") === "on";
        const svc_material_testing = formData.get("svc_material_testing") === "on";

        if (!svc_contract_printing && !svc_3d_scanning && !svc_3d_design && !svc_material_testing) {
            throw new Error("Select at least one service to quote.");
        }

        // Contract Printing details -> params
        const print_time_hours = Number(String(formData.get("print_time_hours") ?? "0").trim());
        const material1_id_raw = String(formData.get("material1_id") ?? "").trim();
        const material1_grams = Number(String(formData.get("material1_grams") ?? "0").trim());

        const material2_id_raw = String(formData.get("material2_id") ?? "").trim();
        const material2_grams = Number(String(formData.get("material2_grams") ?? "0").trim());

        if (!Number.isFinite(print_time_hours) || print_time_hours < 0) throw new Error("Invalid print time.");
        if (!Number.isFinite(material1_grams) || material1_grams < 0) throw new Error("Invalid material 1 grams.");
        if (!Number.isFinite(material2_grams) || material2_grams < 0) throw new Error("Invalid material 2 grams.");

        const material1_id = material1_id_raw.length ? material1_id_raw : null;
        const material2_id = material2_id_raw.length ? material2_id_raw : null;

        if (material1_grams > 0 && !material1_id) throw new Error("Select Material 1 if grams > 0.");
        if (material2_grams > 0 && !material2_id) throw new Error("Select Material 2 if grams > 0.");

        // Other services labor hours
        const scan_labor_hours = Number(String(formData.get("scan_labor_hours") ?? "0").trim());
        const design_labor_hours = Number(String(formData.get("design_labor_hours") ?? "0").trim());
        const test_labor_hours = Number(String(formData.get("test_labor_hours") ?? "0").trim());

        if (!Number.isFinite(scan_labor_hours) || scan_labor_hours < 0) throw new Error("Invalid scanning labor hours.");
        if (!Number.isFinite(design_labor_hours) || design_labor_hours < 0) throw new Error("Invalid design labor hours.");
        if (!Number.isFinite(test_labor_hours) || test_labor_hours < 0) throw new Error("Invalid testing labor hours.");

        // 1) Insert quote header
        const { data: quoteRow, error: quoteErr } = await supabase
            .from("quotes")
            .insert({
                customer_name,
                job_name,
                notes: notes_raw.length ? notes_raw : null,
            })
            .select("id")
            .single();

        if (quoteErr) throw new Error(quoteErr.message);
        const quote_id = quoteRow.id as string;

        // 2) Insert items
        const items: any[] = [];

        if (svc_contract_printing) {
            items.push({
                quote_id,
                service_type: "CONTRACT_PRINTING",
                labor_hours: 0,
                print_time_hours,
                params: {
                    material1_id,
                    material1_grams,
                    material2_id,
                    material2_grams,
                },
            });
        }

        if (svc_3d_scanning) {
            items.push({
                quote_id,
                service_type: "3D_SCANNING",
                labor_hours: scan_labor_hours,
                print_time_hours: 0,
                params: {},
            });
        }

        if (svc_3d_design) {
            items.push({
                quote_id,
                service_type: "3D_DESIGN",
                labor_hours: design_labor_hours,
                print_time_hours: 0,
                params: {},
            });
        }

        if (svc_material_testing) {
            items.push({
                quote_id,
                service_type: "MATERIAL_TESTING",
                labor_hours: test_labor_hours,
                print_time_hours: 0,
                params: {},
            });
        }

        const { error: itemsErr } = await supabase.from("quote_items").insert(items);
        if (itemsErr) throw new Error(itemsErr.message);

        revalidatePath("/quotes/new");
        redirect("/quotes/new?msg=Quote%20saved");
    } catch (e: any) {
        if (isRedirectError(e)) throw e;
        redirect(`/quotes/new?err=${encodeURIComponent(e?.message ?? "Failed to save quote")}`);
    }
}
