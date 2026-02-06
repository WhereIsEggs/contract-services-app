import AppShell from "@/app/components/AppShell";
import { createClient } from "@/app/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import EditMaterialModal from "./EditMaterialModal";
import DeleteMaterialButton from "./DeleteMaterialButton";
import Link from "next/link";



type MaterialRow = {
    id: string;
    name: string;
    category: string | null;
    price_per_lb: number;
    is_active: boolean;
    updated_at: string | null;
};

type SettingRow = {
    key: string;
    label: string | null;
    unit: string | null;
    value: string | number | null;
    updated_at: string | null;
};

export default async function CostsPage({
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

    const [{ data: materials, error: materialsError }, { data: settings, error: settingsError }] =
        await Promise.all([
            supabase
                .from("material_costs")
                .select("id,name,category,price_per_lb,is_active,updated_at")
                .order("name", { ascending: true }),
            supabase
                .from("cost_settings")
                .select("key,label,unit,value,updated_at")
                .order("key", { ascending: true }),
        ]);

    return (
        <AppShell title="Costs Manager">
            <div className="mx-auto w-full max-w-6xl p-6">
                <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold">Costs Manager</h1>
                        <p className="mt-1 text-sm text-neutral-400">
                            Manage materials (filament) and global cost settings. Pricing logic comes later.
                        </p>
                    </div>

                    <Link
                        href="/settings"
                        className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-800 bg-neutral-950 px-4 text-sm font-medium text-neutral-200 hover:bg-neutral-900"
                    >
                        Back to Settings
                    </Link>
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


                {(materialsError || settingsError) && (
                    <div className="mb-6 rounded-md border border-red-900/40 bg-red-950/20 p-3 text-sm text-red-200">
                        <div className="font-medium">Supabase error</div>
                        <div className="mt-1 whitespace-pre-wrap text-red-200/90">
                            {materialsError?.message || settingsError?.message}
                        </div>
                    </div>
                )}

                <div className="grid gap-6 lg:grid-cols-2">
                    {/* =========================
              Materials
          ========================= */}
                    <section className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 shadow-sm">
                        <div className="mb-4 flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-semibold">Materials</h2>
                                <p className="mt-1 text-sm text-neutral-400">
                                    Add, edit, and activate/deactivate your filament/material list.
                                </p>
                            </div>
                        </div>

                        {/* Add Material */}
                        <div className="mb-5 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                            <div className="mb-2 text-sm font-medium text-neutral-200">Add Material</div>
                            <form action={createMaterial} className="grid gap-3">
                                <div className="grid gap-2 md:grid-cols-2">
                                    <label className="grid gap-1">
                                        <span className="text-xs text-neutral-400">Name</span>
                                        <input
                                            name="name"
                                            required
                                            className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
                                            placeholder="e.g., ASA Black"
                                        />
                                    </label>

                                    <label className="grid gap-1">
                                        <span className="text-xs text-neutral-400">Category (optional)</span>
                                        <input
                                            name="category"
                                            className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
                                            placeholder="e.g., ASA / PETG / Resin"
                                        />
                                    </label>
                                </div>

                                <div className="grid gap-2 md:grid-cols-2">
                                    <label className="grid gap-1">
                                        <span className="text-xs text-neutral-400">Price per lb</span>
                                        <input
                                            name="price_per_lb"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            required
                                            className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
                                            placeholder="e.g., 18.50"
                                        />
                                    </label>

                                    <label className="flex items-center gap-2 pt-5">
                                        <input
                                            name="is_active"
                                            type="checkbox"
                                            defaultChecked
                                            className="h-4 w-4 rounded border-neutral-700 bg-neutral-950"
                                        />
                                        <span className="text-sm text-neutral-200">Active</span>
                                    </label>
                                </div>

                                <div>
                                    <button
                                        type="submit"
                                        className="inline-flex h-10 items-center justify-center rounded-md bg-white px-4 text-sm font-medium text-neutral-900 hover:bg-neutral-200"
                                    >
                                        Add Material
                                    </button>
                                </div>
                            </form>
                        </div>

                        {/* Materials Table */}
                        <div className="overflow-x-auto rounded-xl border border-neutral-800">
                            <table className="w-full text-sm">
                                <thead className="bg-neutral-950/60 text-left text-neutral-300">
                                    <tr className="border-b border-neutral-800">
                                        <th className="px-3 py-2">Name</th>
                                        <th className="px-3 py-2">Category</th>
                                        <th className="px-3 py-2">$/lb</th>
                                        <th className="px-3 py-2">Active</th>
                                        <th className="px-3 py-2 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-800 bg-neutral-950/30">
                                    {(materials ?? []).length === 0 ? (
                                        <tr>
                                            <td className="px-3 py-3 text-neutral-400" colSpan={5}>
                                                No materials yet.
                                            </td>
                                        </tr>
                                    ) : (
                                        (materials ?? []).map((m) => (
                                            <tr key={m.id} className="align-top">
                                                <td className="px-3 py-2">
                                                    <div className="font-medium text-neutral-100">{m.name}</div>
                                                    <div className="text-xs text-neutral-500">
                                                        Updated: {m.updated_at ? new Date(m.updated_at).toLocaleString() : "—"}
                                                    </div>
                                                </td>

                                                <td className="px-3 py-2 text-neutral-200">{m.category ?? "—"}</td>

                                                <td className="px-3 py-2 text-neutral-200">
                                                    {Number(m.price_per_lb).toFixed(2)}
                                                </td>

                                                <td className="px-3 py-2">
                                                    <span
                                                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${m.is_active
                                                            ? "bg-emerald-950/40 text-emerald-200 border border-emerald-900/40"
                                                            : "bg-neutral-900/40 text-neutral-300 border border-neutral-800"
                                                            }`}
                                                    >
                                                        {m.is_active ? "Active" : "Inactive"}
                                                    </span>
                                                </td>

                                                <td className="px-3 py-2">
                                                    <div className="flex flex-wrap justify-end gap-2">
                                                        <EditMaterialModal material={m} action={updateMaterial} />

                                                        <form action={toggleMaterialActive}>
                                                            <input type="hidden" name="id" value={m.id} />
                                                            <input type="hidden" name="is_active" value={String(!m.is_active)} />
                                                            <button
                                                                type="submit"
                                                                className="h-9 w-24 rounded-md border border-yellow-900/40 bg-yellow-950/20 px-3 text-xs text-yellow-200 hover:bg-yellow-950/35"
                                                            >
                                                                {m.is_active ? "Deactivate" : "Activate"}
                                                            </button>
                                                        </form>

                                                        <DeleteMaterialButton id={m.id} name={m.name} action={deleteMaterial} />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* =========================
              Settings
          ========================= */}
                    <div className="rounded-xl border border-neutral-800 overflow-hidden">
                        <div className="grid grid-cols-[minmax(0,1fr)_120px_1fr] text-sm">
                            {/* Header */}
                            <div className="px-3 py-2 bg-neutral-950/60 text-neutral-300 border-b border-neutral-800">
                                Label
                            </div>
                            <div className="px-3 py-2 bg-neutral-950/60 text-neutral-300 border-b border-neutral-800">
                                Unit
                            </div>
                            <div className="px-3 py-2 bg-neutral-950/60 text-neutral-300 border-b border-neutral-800 text-right">
                                Value
                            </div>

                            {/* Rows */}
                            {(settings ?? []).map((s) => (
                                <div key={s.key} className="contents">
                                    {/* Label */}
                                    <div className="px-3 py-2 border-b border-neutral-800">
                                        <div className="font-medium text-neutral-100">
                                            {s.label ?? s.key}
                                        </div>
                                        <div className="text-xs text-neutral-500">
                                            Updated:{" "}
                                            {s.updated_at
                                                ? new Date(s.updated_at).toLocaleString()
                                                : "—"}
                                        </div>
                                    </div>

                                    {/* Unit */}
                                    <div className="px-3 py-2 border-b border-neutral-800 text-neutral-200">
                                        {s.unit ?? "—"}
                                    </div>

                                    {/* Value + Save */}
                                    <div className="px-3 py-2 border-b border-neutral-800">
                                        <form
                                            action={updateSetting}
                                            className="flex flex-wrap justify-end gap-2"
                                        >
                                            <input type="hidden" name="key" value={s.key} />
                                            <input
                                                name="value"
                                                defaultValue={s.value ?? ""}
                                                className="h-9 w-32 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
                                            />
                                            <button
                                                type="submit"
                                                className="h-9 rounded-md bg-white px-3 text-sm font-medium text-neutral-900 hover:bg-neutral-200"
                                            >
                                                Save
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div >
        </AppShell >
    );
}

/* =========================
   Server Actions
========================= */

async function createMaterial(formData: FormData) {
    "use server";
    const supabase = await createClient();

    try {
        const name = String(formData.get("name") ?? "").trim();
        const categoryRaw = String(formData.get("category") ?? "").trim();
        const priceStr = String(formData.get("price_per_lb") ?? "").trim();
        const is_active = formData.get("is_active") === "on";

        if (!name) throw new Error("Name is required.");
        const price_per_lb = Number(priceStr);
        if (!Number.isFinite(price_per_lb) || price_per_lb < 0) throw new Error("Invalid price per lb.");

        const { error } = await supabase.from("material_costs").insert({
            name,
            category: categoryRaw.length ? categoryRaw : null,
            price_per_lb,
            is_active,
        });

        if (error) throw new Error(error.message);

        revalidatePath("/costs");
        redirect("/costs?msg=Material%20added");
    } catch (e: any) {
        if (isRedirectError(e)) throw e;
        redirect(`/costs?err=${encodeURIComponent(e?.message ?? "Failed to add material")}`);
    }
}

async function updateMaterial(formData: FormData) {
    "use server";
    const supabase = await createClient();

    try {
        const id = String(formData.get("id") ?? "").trim();
        const name = String(formData.get("name") ?? "").trim();
        const categoryRaw = String(formData.get("category") ?? "").trim();
        const priceStr = String(formData.get("price_per_lb") ?? "").trim();
        const is_active = formData.get("is_active") === "on";

        if (!id) throw new Error("Missing id.");
        if (!name) throw new Error("Name is required.");
        const price_per_lb = Number(priceStr);
        if (!Number.isFinite(price_per_lb) || price_per_lb < 0) throw new Error("Invalid price per lb.");

        const { error } = await supabase
            .from("material_costs")
            .update({
                name,
                category: categoryRaw.length ? categoryRaw : null,
                price_per_lb,
                is_active,
            })
            .eq("id", id);

        if (error) throw new Error(error.message);

        revalidatePath("/costs");
        redirect("/costs?msg=Material%20updated");
    } catch (e: any) {
        if (isRedirectError(e)) throw e;
        redirect(`/costs?err=${encodeURIComponent(e?.message ?? "Failed to update material")}`);
    }
}

async function toggleMaterialActive(formData: FormData) {
    "use server";
    const supabase = await createClient();

    try {
        const id = String(formData.get("id") ?? "").trim();
        const activeStr = String(formData.get("is_active") ?? "").trim();

        if (!id) throw new Error("Missing id.");
        const is_active = activeStr === "true";

        const { error } = await supabase
            .from("material_costs")
            .update({ is_active })
            .eq("id", id);

        if (error) throw new Error(error.message);

        revalidatePath("/costs");
        redirect(`/costs?msg=${is_active ? "Material%20activated" : "Material%20deactivated"}`);
    } catch (e: any) {
        if (isRedirectError(e)) throw e;
        redirect(`/costs?err=${encodeURIComponent(e?.message ?? "Failed to update material status")}`);
    }
}

async function updateSetting(formData: FormData) {
    "use server";
    const supabase = await createClient();

    try {
        const key = String(formData.get("key") ?? "").trim();
        const valueStr = String(formData.get("value") ?? "").trim();

        if (!key) throw new Error("Missing key.");

        const value = Number(valueStr);
        if (!Number.isFinite(value)) throw new Error("Value must be a number.");

        const { error } = await supabase.from("cost_settings").update({ value }).eq("key", key);

        if (error) throw new Error(error.message);

        revalidatePath("/costs");
        redirect("/costs?msg=Setting%20saved");
    } catch (e: any) {
        if (isRedirectError(e)) throw e;
        redirect(`/costs?err=${encodeURIComponent(e?.message ?? "Failed to save setting")}`);
    }
}

async function deleteMaterial(formData: FormData) {
    "use server";
    const supabase = await createClient();

    try {
        const id = String(formData.get("id") ?? "").trim();
        if (!id) throw new Error("Missing id.");

        const { error } = await supabase.from("material_costs").delete().eq("id", id);

        if (error) throw new Error(error.message);

        revalidatePath("/costs");
        redirect("/costs?msg=Material%20deleted");
    } catch (e: any) {
        if (isRedirectError(e)) throw e;
        redirect(`/costs?err=${encodeURIComponent(e?.message ?? "Failed to delete material")}`);
    }
}
