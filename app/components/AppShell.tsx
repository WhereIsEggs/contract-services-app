import Link from "next/link";

export default function AppShell({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-dvh bg-neutral-950 text-neutral-100">
            <div className="grid md:grid-cols-[260px_1fr]">
                {/* Sidebar */}
                <aside className="hidden md:block border-r border-neutral-800 bg-neutral-950/60">
                    <div className="h-dvh sticky top-0 p-4 flex flex-col gap-6">
                        <div>
                            <div className="text-xs tracking-widest text-neutral-500">
                                CONTRACT SERVICES
                            </div>
                            <div className="mt-1 text-lg font-semibold">Dashboard</div>
                        </div>

                        <nav className="grid gap-1 text-sm">
                            <Link
                                href="/"
                                className="rounded-md px-3 py-2 text-neutral-200 hover:bg-neutral-900 hover:text-white"
                            >
                                Requests
                            </Link>

                            <span className="rounded-md px-3 py-2 text-neutral-500">
                                Filters (soon)
                            </span>
                            <span className="rounded-md px-3 py-2 text-neutral-500">
                                Activity (soon)
                            </span>
                            <span className="rounded-md px-3 py-2 text-neutral-500">
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
                            <h1 className="text-base md:text-lg font-semibold truncate">
                                {title}
                            </h1>
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
