import AppShell from "@/app/components/AppShell";
import Link from "next/link";
import { createClient } from "@/app/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    return (
        <AppShell title="Settings" activeNav="costs">
            <div className="mx-auto w-full max-w-3xl grid gap-6">
                <div>
                    <h1 className="text-2xl font-semibold">Settings</h1>
                    <p className="mt-1 text-sm text-neutral-400">
                        Internal configuration for quoting, lead-time scheduling, and materials.
                    </p>
                </div>

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
            </div>
        </AppShell>
    );
}
