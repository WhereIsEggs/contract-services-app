import AppShell from "@/app/components/AppShell";
import Link from "next/link";
import { createClient } from "@/app/lib/supabase/server";



export default async function DashboardPage() {
    const supabase = await createClient();

    const { data: statusCounts } = await supabase
        .from("requests")
        .select("overall_status");

    const counts = {
        "In Progress": statusCounts?.filter((r) => r.overall_status === "In Progress").length ?? 0,
        Completed: statusCounts?.filter((r) => r.overall_status === "Completed").length ?? 0,
    };

    const lateJobsCount = 0; // placeholder for now
    return (
        <AppShell title="Dashboard" hideHeaderTitle>
            <div className="grid gap-6">
                <div className="mb-6">
                    <h2 className="text-2xl font-semibold text-neutral-100">Dashboard</h2>
                    <div className="mt-4 border-b border-neutral-800" />
                </div>

                <section>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <Link
                            href="/requests?status=In%20Progress"
                            className="block transform rounded-lg border border-neutral-800 bg-neutral-950/40 p-3 hover:bg-neutral-900 hover:-translate-y-0.5 transition-transform"
                        >
                            <div className="text-xs text-neutral-400">In Progress</div>
                            <div className="mt-1 text-xl font-semibold text-neutral-100">
                                {counts["In Progress"]}
                            </div>
                        </Link>

                        <Link
                            href="/requests?status=Completed"
                            className="block transform rounded-lg border border-neutral-800 bg-neutral-950/40 p-3 hover:bg-neutral-900 hover:-translate-y-0.5 transition-transform"
                        >
                            <div className="text-xs text-neutral-400">Completed</div>
                            <div className="mt-1 text-xl font-semibold text-neutral-100">
                                {counts.Completed}
                            </div>
                        </Link>
                    </div>
                </section>

                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

                    <Link
                        href="/requests?late=1"
                        className="block transform rounded-lg border border-neutral-800 bg-neutral-950/40 p-3 hover:bg-neutral-900 hover:-translate-y-0.5 transition-transform"
                    >
                        <div className="text-xs text-neutral-400">Late Jobs</div>
                        <div
                            className={`mt-1 text-xl font-semibold ${lateJobsCount > 0 ? "text-red-400" : "text-neutral-100"
                                }`}
                        >
                            {lateJobsCount}
                        </div>
                    </Link>
                    <div className="mt-2 text-base font-semibold"></div>
                </section>
            </div >
        </AppShell >
    );
}
