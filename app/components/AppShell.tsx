"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";


export default function AppShell({
    title,
    children,
    hideHeaderTitle = false,
    activeNav,
    tone = "default",
}: {
    title: string;
    children: React.ReactNode;
    hideHeaderTitle?: boolean;
    activeNav?: "dashboard" | "new_request" | "requests" | "in_progress" | "completed" | "late" | "quote_tool" | "costs" | "reports" | "printers";
    tone?: "default" | "soft";
}) {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const onDashboard = pathname === "/dashboard";
    const onNewRequest = pathname === "/requests/new";
    const onQuoteTool = pathname === "/quotes/new";
    const onQuotes = pathname === "/quotes";
    const onReports = pathname === "/reports";

    // Allow pages (like /requests/[id]) to force the sidebar highlight
    const navOverride = activeNav ?? null;

    const onQuoteToolFinal = navOverride ? navOverride === "quote_tool" : onQuoteTool;
    const onQuotesFinal = navOverride ? navOverride === "quote_tool" : onQuotes;
    const onInProgress = pathname === "/requests" && searchParams.get("status") === "In Progress";
    const onCompleted = pathname === "/requests" && searchParams.get("status") === "Completed";
    const onLateJobs = pathname === "/requests" && searchParams.has("late");

    // Allow pages (like /requests/[id]) to force the sidebar highlight
    const onDashboardFinal = navOverride ? navOverride === "dashboard" : onDashboard;
    const onNewRequestFinal = navOverride ? navOverride === "new_request" : onNewRequest;
    const onInProgressFinal = navOverride ? navOverride === "in_progress" : onInProgress;
    const onCompletedFinal = navOverride ? navOverride === "completed" : onCompleted;
    const onLateJobsFinal = navOverride ? navOverride === "late" : onLateJobs;
    const onReportsFinal = navOverride ? navOverride === "reports" : onReports;

    const hasListFilter = searchParams.has("status") || searchParams.has("late");
    const onRequests =
        pathname === "/requests" &&
        !searchParams.has("status") &&
        !searchParams.has("late");

    const onRequestsFinal = navOverride ? navOverride === "requests" : onRequests;

    const isSoft = tone === "soft";
    const rootClass = isSoft ? "min-h-dvh bg-neutral-900 text-neutral-100" : "min-h-dvh bg-neutral-950 text-neutral-100";
    const sidebarClass = isSoft
        ? "hidden md:block border-r border-neutral-700 bg-neutral-900/70"
        : "hidden md:block border-r border-neutral-800 bg-neutral-950/60";
    const headerClass = isSoft
        ? "border-b border-neutral-700 bg-neutral-900/70"
        : "border-b border-neutral-800 bg-neutral-950/60";


    return (
        <div className={rootClass}>
            <div className="grid md:grid-cols-[260px_1fr]">
                {/* Sidebar */}
            <aside className={sidebarClass}>
                    <div className="h-dvh sticky top-0 p-4 flex flex-col gap-6">
                        <div>
                            <div className="mt-1 text-lg font-semibold">Contract Services</div>
                        </div>

                        <nav className="grid gap-1 text-sm">
                            <Link
                                href="/dashboard"
                                className={`rounded-md px-3 py-2 ${onDashboardFinal
                                    ? "bg-neutral-900 text-white"
                                    : "text-neutral-200 hover:bg-neutral-900 hover:text-white"
                                    }`}
                            >
                                Dashboard
                            </Link>

                            <Link
                                href="/requests/new"
                                className={`block rounded-lg px-3 py-2 text-sm ${onNewRequestFinal
                                    ? "bg-neutral-900 text-white"
                                    : "text-neutral-200 hover:bg-neutral-900 hover:text-white transition"
                                    }`}
                            >
                                New Request
                            </Link>

                            <Link
                                href="/quotes/new"
                                className={`block rounded-lg px-3 py-2 text-sm ${onQuoteToolFinal
                                    ? "bg-neutral-900 text-white"
                                    : "text-neutral-200 hover:bg-neutral-900 hover:text-white transition"
                                    }`}
                            >
                                New Quote
                            </Link>

                            <Link
                                href="/requests?sort=request&dir=desc"
                                className={`rounded-md px-3 py-2 ${onRequestsFinal
                                    ? "bg-neutral-900 text-white"
                                    : "text-neutral-200 hover:bg-neutral-900 hover:text-white"
                                    }`}
                            >
                                Not Started
                            </Link>


                            <Link
                                href="/requests?status=In%20Progress&sort=request&dir=desc"
                                className={`rounded-md px-3 py-2 ${onInProgressFinal
                                    ? "bg-neutral-900 text-white"
                                    : "text-neutral-200 hover:bg-neutral-900 hover:text-white"
                                    }`}
                            >
                                In Progress
                            </Link>

                            <Link
                                href="/requests?status=Completed&sort=request&dir=desc"
                                className={`rounded-md px-3 py-2 ${onCompletedFinal
                                    ? "bg-neutral-900 text-white"
                                    : "text-neutral-200 hover:bg-neutral-900 hover:text-white"
                                    }`}
                            >
                                Completed
                            </Link>

                            <Link
                                href="/requests?late=1&sort=request&dir=desc"
                                className={`rounded-md px-3 py-2 ${onLateJobsFinal
                                    ? "bg-neutral-900 text-white"
                                    : "text-neutral-200 hover:bg-neutral-900 hover:text-white"
                                    }`}
                            >
                                Late Jobs
                            </Link>

                            <Link
                                href="/quotes"
                                className={`block rounded-lg px-3 py-2 text-sm ${onQuotesFinal
                                    ? "bg-neutral-900 text-white"
                                    : "text-neutral-200 hover:bg-neutral-900 hover:text-white transition"
                                    }`}
                            >
                                Quotes
                            </Link>

                            <Link
                                href="/reports"
                                className={`block rounded-lg px-3 py-2 text-sm ${onReportsFinal
                                    ? "bg-neutral-900 text-white"
                                    : "text-neutral-200 hover:bg-neutral-900 hover:text-white transition"
                                    }`}
                            >
                                Reports
                            </Link>

                            <Link
                                href="/settings"
                                className="rounded-md px-3 py-2 text-neutral-200 hover:bg-neutral-900 hover:text-white"
                            >
                                Settings
                            </Link>
                        </nav>

                        <div className="mt-auto grid gap-3">
                            <form method="POST" action="/auth/logout">
                                <button
                                    type="submit"
                                    className="w-full rounded-md px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-900 hover:text-white"
                                >
                                    Log out
                                </button>
                            </form>

                            <div className="text-xs text-neutral-500 px-3">
                                Internal tool • Supabase
                            </div>
                        </div>
                    </div>
                </aside>

                {/* Main */}
                <div className="min-w-0">
                    <header className={headerClass}>
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
