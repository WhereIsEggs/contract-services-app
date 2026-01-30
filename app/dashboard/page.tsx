import AppShell from "@/app/components/AppShell";
import Link from "next/link";


export default function DashboardPage() {
    const lateJobsCount = 0;
    return (
        <AppShell title="Dashboard">
            <div className="grid gap-6">
                <section className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-neutral-100">Overview</h2>
                    <p className="mt-2 text-sm text-neutral-400">
                        This will show realtime status counts, late jobs, and in-progress work.
                    </p>
                </section>

                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Link
                        href="/requests#new"
                        className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 shadow-sm hover:bg-neutral-900 transition block"
                    >
                        <div className="text-sm text-neutral-400">Requests</div>
                        <div className="mt-2 text-base font-semibold">View all</div>
                    </Link>

                    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 shadow-sm">
                        <Link
                            href="/requests"
                            className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 shadow-sm hover:bg-neutral-900 transition block"
                        >
                            <div className="text-sm text-neutral-400">New Request</div>
                            <div className="mt-2 text-base font-semibold">Submit</div>
                        </Link>
                    </div>

                    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 shadow-sm">
                        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 shadow-sm">
                            <div className="text-sm text-neutral-400">Late Jobs</div>
                            <div
                                className={`mt-2 text-2xl font-semibold ${lateJobsCount > 0 ? "text-red-400" : "text-neutral-100"
                                    }`}
                            >
                                {lateJobsCount}
                            </div>
                            <p className="mt-1 text-xs text-neutral-500">
                                Past due based on job deadline
                            </p>
                        </div>
                        <div className="mt-2 text-base font-semibold">0</div>
                    </div>
                </section>
            </div>
        </AppShell>
    );
}
