import AppShell from "@/app/components/AppShell";
import Link from "next/link";
import { createClient } from "@/app/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function SettingsPage({
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

    return (
        <AppShell title="Settings" activeNav="costs">
            <div className="mx-auto w-full max-w-3xl grid gap-6">
                <div>
                    <h1 className="text-2xl font-semibold">Settings</h1>
                    <p className="mt-1 text-sm text-neutral-400">
                        Internal configuration for quoting, lead-time scheduling, and materials.
                    </p>
                </div>

                {sp?.msg ? (
                    <div className="rounded-md border border-emerald-900/40 bg-emerald-950/20 p-3 text-sm text-emerald-200">
                        {sp.msg}
                    </div>
                ) : null}

                {sp?.err ? (
                    <div className="rounded-md border border-red-900/40 bg-red-950/20 p-3 text-sm text-red-200">
                        {sp.err}
                    </div>
                ) : null}

                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="text-sm font-semibold text-neutral-100">Quoting</div>
                    <div className="mt-2 grid gap-2 text-sm">
                        <Link
                            href="/costs"
                            className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-neutral-200 hover:bg-neutral-900"
                        >
                            Manage materials & rates
                        </Link>
                        <div className="text-xs text-neutral-500">
                            Materials (price/lb), quote rates, and lead-time scheduling settings.
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="text-sm font-semibold text-neutral-100">3D Printers</div>
                    <div className="mt-2 grid gap-2 text-sm">
                        <Link
                            href="/printers"
                            className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-neutral-200 hover:bg-neutral-900"
                        >
                            Manage printer availability
                        </Link>
                        <div className="text-xs text-neutral-500">
                            Add printers and update current status (Available, In Use, Maintenance, Offline).
                        </div>
                    </div>
                </div>
            </div>
        </AppShell>
    );
}
