import { createClient } from "@/app/lib/supabase/server";
import { createRequestAction } from "@/app/actions";
import NewRequestFormClient from "./NewRequestFormClient";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";

export default async function NewRequestPage({
    searchParams,
}: {
    searchParams?: Promise<{ err?: string }>;
}) {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }

    return (
        <AppShell title="New Request" hideHeaderTitle tone="soft">
            <div className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-6">
                <div className="mb-6">
                    <h2 className="text-2xl font-semibold text-neutral-100">New Request</h2>
                    <p className="mt-2 text-sm text-neutral-400">
                        Submit a new contract services request for tracking and assignment.
                    </p>
                </div>

                <hr className="my-6 border-neutral-700" />

                <NewRequestFormClient action={createRequestAction} />
            </div>
        </AppShell>
    );
}
