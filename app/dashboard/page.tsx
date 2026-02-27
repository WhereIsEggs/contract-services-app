import AppShell from "@/app/components/AppShell";
import DashboardCharts from "@/app/components/DashboardCharts";
import Link from "next/link";
import { createClient } from "@/app/lib/supabase/server";
import { recalculateLeadTimesForOpenRequests } from "@/app/lib/lead-times";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const PRINTER_STATUS_OPTIONS = ["Available", "In Use", "Maintenance", "Offline"] as const;

function printerNameFromKey(key: string) {
    const raw = String(key ?? "");
    if (raw.startsWith("printer_status:")) {
        return raw.slice("printer_status:".length).trim();
    }
    if (raw.startsWith("printer_status__")) {
        return raw.slice("printer_status__".length).replace(/_/g, " ").trim();
    }
    return "";
}

function printerLocationFromRow(row: any): "Austin" | "PR" {
    const raw = String(row?.label ?? "");
    const match = raw.match(/Location:\s*(Austin|PR)/i);
    if (match?.[1]) {
        return match[1].toUpperCase() === "PR" ? "PR" : "Austin";
    }
    return "Austin";
}

function printerNameFromAssignmentKey(key: string) {
    const raw = String(key ?? "");
    if (raw.startsWith("printer_assignment:")) return raw.slice("printer_assignment:".length).trim();
    if (raw.startsWith("printer_assignment__")) return raw.slice("printer_assignment__".length).replace(/_/g, " ").trim();
    return "";
}

function printerNameFromHostKey(key: string) {
    const raw = String(key ?? "");
    if (raw.startsWith("printer_host:")) return raw.slice("printer_host:".length).trim();
    if (raw.startsWith("printer_host__")) return raw.slice("printer_host__".length).replace(/_/g, " ").trim();
    return "";
}

function printerHostHref(host: string) {
    const raw = String(host ?? "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    return `http://${raw}`;
}

function printerStatusBadgeClass(status: string) {
    const normalized = String(status ?? "").trim().toLowerCase();
    if (normalized === "available" || normalized === "idle") {
        return "border-emerald-900/40 bg-emerald-950/30 text-emerald-200";
    }
    if (normalized === "in use" || normalized === "busy" || normalized === "printing") {
        return "border-blue-900/40 bg-blue-950/30 text-blue-200";
    }
    if (normalized === "maintenance") {
        return "border-amber-900/40 bg-amber-950/30 text-amber-200";
    }
    if (normalized === "offline" || normalized === "down") {
        return "border-red-900/40 bg-red-950/30 text-red-200";
    }
    return "border-neutral-700 bg-neutral-800/50 text-neutral-200";
}

function printerStatusFromRow(row: any) {
    const fromUnit = String(row?.unit ?? "").trim();
    if (fromUnit) return fromUnit;

    const numeric = Number(row?.value);
    if (Number.isFinite(numeric)) {
        if (numeric === 1) return "Available";
        if (numeric === 2) return "In Use";
        if (numeric === 3) return "Maintenance";
        if (numeric === 4) return "Offline";
    }

    const fromValue = String(row?.value ?? "").trim();
    return fromValue || "Unknown";
}

export default async function DashboardPage({
    searchParams,
}: {
    searchParams?: Promise<{ msg?: string; err?: string }>;
}) {
    const supabase = await createClient();
    const sp = await searchParams;

    const { data: statusCounts, error } = await supabase.from("requests").select(`
    id,
    customer_name,
    overall_status,
    created_at,
    request_services (
            id,
      service_type,
      step_status,
      sort_order,
            updated_at,
            completed_at
    )
  `);

    const rows = statusCounts ?? [];

    const { data: printerSettingRows } = await supabase
        .from("cost_settings")
        .select("key,label,unit,value")
        .or("key.like.printer_status:%,key.like.printer_status__%,key.like.printer_assignment:%,key.like.printer_assignment__%,key.like.printer_host:%,key.like.printer_host__%")
        .order("key", { ascending: true });

    const assignmentByPrinter = new Map<string, string>();
    const assignmentRequestIdByPrinter = new Map<string, string>();
    const hostByPrinter = new Map<string, string>();
    for (const row of (printerSettingRows ?? []) as any[]) {
        const key = String(row?.key ?? "");
        if (key.startsWith("printer_assignment:")) {
            const name = printerNameFromAssignmentKey(key);
            if (!name) continue;
            const reqId = String(row?.unit ?? "").trim();
            const reqNum = Number(row?.value);
            if (reqId) assignmentRequestIdByPrinter.set(name, reqId);
            if (Number.isFinite(reqNum)) {
                assignmentByPrinter.set(name, String(Math.floor(reqNum)).padStart(5, "0"));
            }
            continue;
        }

        if (key.startsWith("printer_host:")) {
            const name = printerNameFromHostKey(key);
            if (!name) continue;
            const host = String(row?.unit ?? "").trim();
            if (host) hostByPrinter.set(name, host);
        }
    }

    const printers = (printerSettingRows ?? [])
        .filter((row: any) => String(row?.key ?? "").startsWith("printer_status:"))
        .map((row: any) => {
            const name = printerNameFromKey(String(row?.key ?? ""));
            const status = printerStatusFromRow(row);
            const location = printerLocationFromRow(row);
            const assignedRequestNumber = assignmentByPrinter.get(name) ?? "";
            const assignedRequestId = assignmentRequestIdByPrinter.get(name) ?? "";
            const host = hostByPrinter.get(name) ?? "";
            const isLockedInUse = status === "In Use" && assignedRequestId.length > 0;
            return {
                key: String(row?.key ?? ""),
                name,
                location,
                status,
                host,
                assignedRequestNumber,
                assignedRequestId,
                isLockedInUse,
            };
        })
        .filter((p: any) => p.name.length > 0 && p.key.length > 0);

    const printersAustin = printers.filter((p: any) => p.location === "Austin");
    const printersPR = printers.filter((p: any) => p.location === "PR");

    // --- Counts (Active vs Waiting vs Completed) ---
    const activeInProgress =
        rows.filter((r: any) => {
            if (r.overall_status !== "In Progress") return false;
            const steps = Array.isArray(r.request_services) ? r.request_services : [];
            return steps.some((s: any) => s.step_status === "In Progress");
        }).length ?? 0;

    const waitingInProgress =
        rows.filter((r: any) => {
            if (r.overall_status !== "In Progress") return false;
            const steps = Array.isArray(r.request_services) ? r.request_services : [];
            const hasActive = steps.some((s: any) => s.step_status === "In Progress");
            const hasWaiting = steps.some(
                (s: any) => s.step_status === "Not Started" || s.step_status === "Waiting"
            );
            return !hasActive && hasWaiting;
        }).length ?? 0;

    const completedCount = rows.filter((r: any) => r.overall_status === "Completed").length ?? 0;
    const notStartedCount = rows.filter((r: any) => r.overall_status === "New").length ?? 0;

    const counts = {
        Active: activeInProgress,
        Waiting: waitingInProgress,
        Completed: completedCount,
    };

    // --- Oldest active job (since last update on the active step) ---
    const oldestActive = (() => {
        const activeRequests = rows.filter((r: any) => {
            if (r.overall_status !== "In Progress") return false;
            const steps = Array.isArray(r.request_services) ? r.request_services : [];
            return steps.some((s: any) => s.step_status === "In Progress");
        });

        let best:
            | {
                requestId: string;
                customerName: string | null;
                minutes: number;
                label: string;
            }
            | null = null;

        for (const r of activeRequests) {
            const steps = Array.isArray(r.request_services) ? r.request_services : [];
            const sorted = steps
                .slice()
                .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

            const activeStep = sorted.find((s: any) => s.step_status === "In Progress") ?? null;
            const nextStep =
                sorted.find((s: any) => s.step_status === "Not Started" || s.step_status === "Waiting") ??
                null;

            if (!activeStep?.updated_at) continue;

            const minutes = Math.round((Date.now() - new Date(activeStep.updated_at).getTime()) / 60000);

            const label = nextStep
                ? `${activeStep.service_type} (next: ${nextStep.service_type})`
                : `${activeStep.service_type}`;

            if (best === null || minutes > best.minutes) {
                best = {
                    requestId: r.id,
                    customerName: r.customer_name ?? null,
                    minutes,
                    label,
                };
            }
        }

        return best;
    })();

    const allStepIds = rows.flatMap((r: any) =>
        Array.isArray(r.request_services)
            ? (r.request_services as any[])
                .map((s: any) => String(s.id ?? ""))
                .filter(Boolean)
            : []
    );

    const { data: actualRows } = allStepIds.length
        ? await supabase
            .from("service_actuals")
            .select("service_id, data")
            .in("service_id", allStepIds)
        : { data: [] as any[] };

    const leadByServiceId = new Map<string, any>(
        (actualRows ?? []).map((r: any) => [String(r.service_id), (r?.data as any)?.lead_time ?? null])
    );

    const nowMs = Date.now();

    const lateJobsCount = rows.filter((r: any) => {
        if (r.overall_status === "Completed") return false;
        const steps = Array.isArray(r.request_services) ? (r.request_services as any[]) : [];

        return steps.some((s: any) => {
            if (String(s.step_status ?? "") === "Completed") return false;
            const lead = leadByServiceId.get(String(s.id ?? ""));
            const dueMs = lead?.due_at ? Date.parse(String(lead.due_at)) : NaN;
            return Number.isFinite(dueMs) && dueMs < nowMs;
        });
    }).length;

    const completedServicesForCharts = rows.flatMap((r: any) => {
        const steps = Array.isArray(r.request_services) ? (r.request_services as any[]) : [];
        return steps
            .filter((s: any) => String(s.step_status ?? "") === "Completed" && s.completed_at)
            .map((s: any) => ({
                completedAt: String(s.completed_at),
                serviceType: String(s.service_type ?? "Unknown"),
            }));
    });

    const requestCreationsForCharts = rows
        .map((r: any) => String(r.created_at ?? ""))
        .filter(Boolean);

    const lateOpenByServiceMap = new Map<string, number>();
    for (const r of rows as any[]) {
        if (String(r.overall_status ?? "") === "Completed") continue;
        const steps = Array.isArray(r.request_services) ? (r.request_services as any[]) : [];
        for (const s of steps) {
            if (String(s.step_status ?? "") === "Completed") continue;
            const lead = leadByServiceId.get(String(s.id ?? ""));
            const dueMs = lead?.due_at ? Date.parse(String(lead.due_at)) : NaN;
            if (Number.isFinite(dueMs) && dueMs < nowMs) {
                const key = String(s.service_type ?? "Unknown");
                lateOpenByServiceMap.set(key, (lateOpenByServiceMap.get(key) ?? 0) + 1);
            }
        }
    }

    const lateOpenByService = Array.from(lateOpenByServiceMap.entries()).map(([serviceType, count]) => ({
        serviceType,
        count,
    }));

    return (
        <AppShell title="Dashboard" hideHeaderTitle tone="soft">
            <div className="grid gap-6">
                <div className="mb-6">
                    <h2 className="text-2xl font-semibold text-neutral-100">Dashboard</h2>
                    <div className="mt-4 border-b border-neutral-700" />
                </div>

                {error ? (
                    <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-4 text-sm text-red-300">
                        Error loading dashboard data.
                    </div>
                ) : null}

                {sp?.msg ? (
                    <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-3 text-sm text-emerald-200">
                        {sp.msg}
                    </div>
                ) : null}

                {sp?.err ? (
                    <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-3 text-sm text-red-200">
                        {sp.err}
                    </div>
                ) : null}

                {/* Top stats (A: add color accents) */}
                <section>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Link
                            href="/requests?status=New&sort=request&dir=desc"
                            className="block transform rounded-lg border border-neutral-700 bg-neutral-900/50 p-3 hover:bg-neutral-800/70 hover:-translate-y-0.5 transition-transform border-l-4 border-l-neutral-500"
                        >
                            <div className="text-xs text-neutral-400">Not Started</div>
                            <div className="mt-1 text-xl font-semibold text-neutral-100">{notStartedCount}</div>
                        </Link>

                        <Link
                            href="/requests?status=In%20Progress&sort=request&dir=desc"
                            className="block transform rounded-lg border border-neutral-700 bg-neutral-900/50 p-3 hover:bg-neutral-800/70 hover:-translate-y-0.5 transition-transform border-l-4 border-l-blue-500"
                        >
                            <div className="text-xs text-neutral-400">In Progress</div>
                            <div className="mt-1 text-xl font-semibold text-neutral-100">{counts.Active}</div>
                        </Link>

                        <Link
                            href="/requests?status=Completed&sort=request&dir=desc"
                            className="block transform rounded-lg border border-neutral-700 bg-neutral-900/50 p-3 hover:bg-neutral-800/70 hover:-translate-y-0.5 transition-transform border-l-4 border-l-emerald-500"
                        >
                            <div className="text-xs text-neutral-400">Completed</div>
                            <div className="mt-1 text-xl font-semibold text-neutral-100">{counts.Completed}</div>
                        </Link>

                        <Link
                            href="/requests?late=1&sort=request&dir=desc"
                            className="block transform rounded-lg border border-neutral-700 bg-neutral-900/50 p-3 hover:bg-neutral-800/70 hover:-translate-y-0.5 transition-transform border-l-4 border-l-red-500"
                        >
                            <div className="text-xs text-neutral-400">Late Jobs</div>
                            <div className={`mt-1 text-xl font-semibold ${lateJobsCount > 0 ? "text-red-400" : "text-emerald-400"}`}>
                                {lateJobsCount}
                            </div>
                        </Link>
                    </div>

                    {oldestActive ? (
                        <div className="mt-2 text-sm text-neutral-400">
                            Oldest active job:{" "}
                            <Link
                                href={`/requests/${oldestActive.requestId}`}
                                className="text-neutral-200 underline hover:text-white"
                            >
                                {oldestActive.customerName ?? "Unnamed customer"}
                            </Link>{" "}
                            <span className="text-neutral-500">— {oldestActive.label}</span>{" "}
                            <span className="text-neutral-200">
                                {oldestActive.minutes >= 60
                                    ? `${Math.floor(oldestActive.minutes / 60)}h ${oldestActive.minutes % 60}m`
                                    : `${oldestActive.minutes}m`}
                            </span>{" "}
                            since last update
                        </div>
                    ) : (
                        <div className="mt-2 text-sm text-neutral-500">No active jobs right now.</div>
                    )}
                </section>

                <DashboardCharts
                    statusCounts={{
                        active: counts.Active,
                        waiting: counts.Waiting,
                        completed: counts.Completed,
                    }}
                    completedServices={completedServicesForCharts}
                    requestCreations={requestCreationsForCharts}
                    lateOpenByService={lateOpenByService}
                />

                <section className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-4 border-l-4 border-l-cyan-500">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-neutral-100">3D Printers</h3>
                    </div>

                    {printers.length === 0 ? (
                        <div className="mt-3 text-sm text-neutral-500">
                            No printers configured yet.
                        </div>
                    ) : (
                        <div className="mt-3 grid gap-4 md:grid-cols-2">
                            <div className="rounded-md border border-neutral-700 bg-neutral-900/50 p-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Austin</div>
                                {printersAustin.length === 0 ? (
                                    <div className="mt-2 text-xs text-neutral-500">No printers in Austin.</div>
                                ) : (
                                    <div className="mt-2 grid gap-2">
                                        {printersAustin.map((printer: any) => (
                                            <div
                                                key={`austin-${printer.name}-${printer.status}-${printer.assignedRequestId}`}
                                                className="rounded-md border border-neutral-700 bg-neutral-900/55 px-3 py-2"
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    {printer.host ? (
                                                        <a
                                                            href={printerHostHref(printer.host)}
                                                            target="_blank"
                                                            rel="noreferrer noopener"
                                                            className="truncate text-sm text-blue-300 underline hover:text-blue-200"
                                                            title={printer.host}
                                                        >
                                                            {printer.name}
                                                        </a>
                                                    ) : (
                                                        <div className="truncate text-sm text-neutral-100">{printer.name}</div>
                                                    )}
                                                    {printer.isLockedInUse ? (
                                                        <span
                                                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${printerStatusBadgeClass(printer.status)}`}
                                                        >
                                                            {printer.status}
                                                        </span>
                                                    ) : (
                                                        <form action={updatePrinterStatusFromDashboard} className="flex items-center gap-2">
                                                            <input type="hidden" name="printer_key" value={printer.key} />
                                                            <input type="hidden" name="printer_name" value={printer.name} />
                                                            <select
                                                                name="status"
                                                                defaultValue={printer.status}
                                                                className="h-7 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-100"
                                                            >
                                                                {PRINTER_STATUS_OPTIONS.map((status) => (
                                                                    <option key={status} value={status}>{status}</option>
                                                                ))}
                                                            </select>
                                                            <button
                                                                type="submit"
                                                                className="h-7 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-[11px] text-neutral-100 hover:bg-neutral-800"
                                                            >
                                                                Save
                                                            </button>
                                                        </form>
                                                    )}
                                                </div>
                                                {printer.assignedRequestNumber ? (
                                                    <div className="mt-1 text-xs text-neutral-500">
                                                        Request {printer.assignedRequestNumber}
                                                    </div>
                                                ) : null}
                                                {printer.isLockedInUse ? (
                                                    <div className="mt-1 text-[11px] text-neutral-500">
                                                        Locked while assigned to active request.
                                                    </div>
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="rounded-md border border-neutral-700 bg-neutral-900/50 p-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">PR</div>
                                {printersPR.length === 0 ? (
                                    <div className="mt-2 text-xs text-neutral-500">No printers in PR.</div>
                                ) : (
                                    <div className="mt-2 grid gap-2">
                                        {printersPR.map((printer: any) => (
                                            <div
                                                key={`pr-${printer.name}-${printer.status}-${printer.assignedRequestId}`}
                                                className="rounded-md border border-neutral-700 bg-neutral-900/55 px-3 py-2"
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    {printer.host ? (
                                                        <a
                                                            href={printerHostHref(printer.host)}
                                                            target="_blank"
                                                            rel="noreferrer noopener"
                                                            className="truncate text-sm text-blue-300 underline hover:text-blue-200"
                                                            title={printer.host}
                                                        >
                                                            {printer.name}
                                                        </a>
                                                    ) : (
                                                        <div className="truncate text-sm text-neutral-100">{printer.name}</div>
                                                    )}
                                                    {printer.isLockedInUse ? (
                                                        <span
                                                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${printerStatusBadgeClass(printer.status)}`}
                                                        >
                                                            {printer.status}
                                                        </span>
                                                    ) : (
                                                        <form action={updatePrinterStatusFromDashboard} className="flex items-center gap-2">
                                                            <input type="hidden" name="printer_key" value={printer.key} />
                                                            <input type="hidden" name="printer_name" value={printer.name} />
                                                            <select
                                                                name="status"
                                                                defaultValue={printer.status}
                                                                className="h-7 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-100"
                                                            >
                                                                {PRINTER_STATUS_OPTIONS.map((status) => (
                                                                    <option key={status} value={status}>{status}</option>
                                                                ))}
                                                            </select>
                                                            <button
                                                                type="submit"
                                                                className="h-7 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-[11px] text-neutral-100 hover:bg-neutral-800"
                                                            >
                                                                Save
                                                            </button>
                                                        </form>
                                                    )}
                                                </div>
                                                {printer.assignedRequestNumber ? (
                                                    <div className="mt-1 text-xs text-neutral-500">
                                                        Request {printer.assignedRequestNumber}
                                                    </div>
                                                ) : null}
                                                {printer.isLockedInUse ? (
                                                    <div className="mt-1 text-[11px] text-neutral-500">
                                                        Locked while assigned to active request.
                                                    </div>
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </section>

            </div>
        </AppShell>
    );
}

function printerStatusCodeForLabel(status: string) {
    const normalized = String(status ?? "").trim().toLowerCase();
    if (normalized === "available") return 1;
    if (normalized === "in use") return 2;
    if (normalized === "maintenance") return 3;
    if (normalized === "offline") return 4;
    return 0;
}

function printerAssignmentKey(name: string) {
    return `printer_assignment:${String(name ?? "").trim()}`;
}

async function updatePrinterStatusFromDashboard(formData: FormData) {
    "use server";
    const supabase = await createClient();

    try {
        const printerKey = String(formData.get("printer_key") ?? "").trim();
        const printerName = String(formData.get("printer_name") ?? "").trim();
        const status = String(formData.get("status") ?? "").trim();

        if (!printerKey || !printerName) throw new Error("Missing printer information.");
        if (!PRINTER_STATUS_OPTIONS.includes(status as any)) throw new Error("Invalid printer status.");

        const { data: assignmentRow, error: assignmentErr } = await supabase
            .from("cost_settings")
            .select("unit")
            .eq("key", printerAssignmentKey(printerName))
            .maybeSingle();

        if (assignmentErr) throw new Error(assignmentErr.message);

        const hasAssignment = String((assignmentRow as any)?.unit ?? "").trim().length > 0;
        if (hasAssignment) {
            const { data: existingStatusRow } = await supabase
                .from("cost_settings")
                .select("unit")
                .eq("key", printerKey)
                .maybeSingle();
            const currentStatus = String((existingStatusRow as any)?.unit ?? "").trim();
            if (currentStatus === "In Use") {
                throw new Error("This printer is assigned by an active Contract Print and cannot be changed here.");
            }
        }

        const { data: existingStatusRow, error: existingErr } = await supabase
            .from("cost_settings")
            .select("label")
            .eq("key", printerKey)
            .single();

        if (existingErr) throw new Error(existingErr.message);

        const { error: updateErr } = await supabase
            .from("cost_settings")
            .update({
                unit: status,
                value: printerStatusCodeForLabel(status),
                label: (existingStatusRow as any)?.label ?? null,
            })
            .eq("key", printerKey);

        if (updateErr) throw new Error(updateErr.message);

        if (status !== "In Use") {
            const { error: clearAssignErr } = await supabase
                .from("cost_settings")
                .delete()
                .eq("key", printerAssignmentKey(printerName));
            if (clearAssignErr) throw new Error(clearAssignErr.message);
        }

        await recalculateLeadTimesForOpenRequests(supabase);

        revalidatePath("/dashboard");
        revalidatePath("/printers");
        redirect("/dashboard?msg=Printer%20status%20updated");
    } catch (e: any) {
        redirect(`/dashboard?err=${encodeURIComponent(e?.message ?? "Failed to update printer status")}`);
    }
}
