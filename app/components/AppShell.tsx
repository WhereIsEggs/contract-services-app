"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";


export default function AppShell({
    title,
    children,
    hideHeaderTitle = false,
}: {
    title: string;
    children: React.ReactNode;
    hideHeaderTitle?: boolean;
}) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const onDashboard = pathname === "/dashboard";
    const onNewRequest = pathname === "/requests/new";
    const onInProgress = pathname === "/requests" && searchParams.get("status") === "In Progress";
    const onCompleted = pathname === "/requests" && searchParams.get("status") === "Completed";
    const onLateJobs = pathname === "/requests" && searchParams.has("late");

    const hasListFilter = searchParams.has("status") || searchParams.has("late");
    const onRequests =
        (pathname === "/requests" && !hasListFilter) ||
        (pathname.startsWith("/requests/") &&
            pathname !== "/requests/new" &&
            pathname !== "/requests");

    return (
        <div className="min-h-dvh bg-neutral-950 text-neutral-100">
            <div className="grid md:grid-cols-[260px_1fr]">
                {/* Sidebar */}
                <aside className="hidden md:block border-r border-neutral-800 bg-neutral-950/60">
                    <div className="h-dvh sticky top-0 p-4 flex flex-col gap-6">
                        <div>
                            <div className="mt-1 text-lg font-semibold">Contract Services</div>
                        </div>

                        <nav className="grid gap-1 text-sm">
                            <Link
                                href="/dashboard"
                                className={`rounded-md px-3 py-2 ${onDashboard
                                    ? "bg-neutral-900 text-white"
                                    : "text-neutral-200 hover:bg-neutral-900 hover:text-white"
                                    }`}
                            >
                                Dashboard
                            </Link>

                            <Link
                                href="/requests/new"
                                className={`block rounded-lg px-3 py-2 text-sm ${onNewRequest
                                    ? "bg-neutral-900 text-white"
                                    : "text-neutral-200 hover:bg-neutral-900 hover:text-white transition"
                                    }`}
                            >
                                Submit New Request
                            </Link>

                            <Link
                                href="/requests"
                                className={`rounded-md px-3 py-2 ${onRequests
                                    ? "bg-neutral-900 text-white"
                                    : "text-neutral-200 hover:bg-neutral-900 hover:text-white"
                                    }`}
                            >
                                Requests
                            </Link>


                            <Link
                                href="/requests?status=In%20Progress"
                                className={`rounded-md px-3 py-2 ${onInProgress
                                    ? "bg-neutral-900 text-white"
                                    : "text-neutral-200 hover:bg-neutral-900 hover:text-white"
                                    }`}
                            >
                                In Progress
                            </Link>

                            <Link
                                href="/requests?status=Completed"
                                className={`rounded-md px-3 py-2 ${onCompleted
                                    ? "bg-neutral-900 text-white"
                                    : "text-neutral-200 hover:bg-neutral-900 hover:text-white"
                                    }`}
                            >
                                Completed
                            </Link>

                            <Link
                                href="/requests?late=1"
                                className={`rounded-md px-3 py-2 ${onLateJobs
                                    ? "bg-neutral-900 text-white"
                                    : "text-neutral-200 hover:bg-neutral-900 hover:text-white"
                                    }`}
                            >
                                Late Jobs
                            </Link>

                            <span className="rounded-md px-3 py-2 text-neutral-500 cursor-not-allowed opacity-60">
                                Filters (soon)
                            </span>
                            <span className="rounded-md px-3 py-2 text-neutral-500 cursor-not-allowed opacity-60">
                                Activity (soon)
                            </span>
                            <span className="rounded-md px-3 py-2 text-neutral-500 cursor-not-allowed opacity-60">
                                Settings (soon)
                            </span>
                        </nav>

                        <div className="mt-auto text-xs text-neutral-500">
                            Internal tool • Supabase
                        </div>
                    </div>
                </aside>

                {/* Main */}
                <div className="min-w-0">
                    <header className="border-b border-neutral-800 bg-neutral-950/60">
                        <div className="mx-auto max-w-[1100px] px-6 py-4 flex items-center justify-between gap-4">
                            {!hideHeaderTitle && (
                                <h1 className="text-base md:text-lg font-semibold truncate">
                                    {title}
                                </h1>
                            )}
                            <div className="text-xs text-neutral-500">
                                {/* right-side actions later */}
                            </div>
                        </div>
                    </header>

                    <main className="mx-auto max-w-[1100px] p-6">{children}</main>
                </div>
            </div>
        </div>
    );
}
