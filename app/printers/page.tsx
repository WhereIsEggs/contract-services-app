import AppShell from "@/app/components/AppShell";
import { createClient } from "@/app/lib/supabase/server";
import { recalculateLeadTimesForOpenRequests } from "@/app/lib/lead-times";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";

type PrinterRow = {
  key: string;
  label: string | null;
  unit: string | null;
  value: string | number | null;
  updated_at: string | null;
};

const PRINTER_STATUS_OPTIONS = ["Available", "In Use", "Maintenance", "Offline"] as const;
const PRINTER_STATUS_IN_USE = "In Use";
const PRINTER_LOCATION_OPTIONS = ["Austin", "PR"] as const;

function statusCodeForLabel(status: string) {
  const idx = PRINTER_STATUS_OPTIONS.findIndex(
    (s) => s.toLowerCase() === String(status ?? "").trim().toLowerCase()
  );
  return idx >= 0 ? idx + 1 : 0;
}

function statusLabelFromRow(row: PrinterRow) {
  const fromUnit = String(row.unit ?? "").trim();
  if (fromUnit) return fromUnit;
  const numeric = Number(row.value);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= PRINTER_STATUS_OPTIONS.length) {
    return PRINTER_STATUS_OPTIONS[Math.floor(numeric) - 1];
  }
  return "Unknown";
}

function locationLabelFromRow(row: PrinterRow) {
  const raw = String(row.label ?? "");
  const match = raw.match(/Location:\s*(Austin|PR)/i);
  if (match?.[1]) {
    const v = match[1].toUpperCase() === "PR" ? "PR" : "Austin";
    return v;
  }
  return "Austin";
}

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

function printerKeyFromName(name: string) {
  return `printer_status:${name.trim()}`;
}

function printerAssignmentKey(name: string) {
  return `printer_assignment:${String(name ?? "").trim()}`;
}

function printerHostKey(name: string) {
  return `printer_host:${String(name ?? "").trim()}`;
}

export default async function PrintersPage({
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

  const { data: printerRows, error: printerErr } = await supabase
    .from("cost_settings")
    .select("key,label,unit,value,updated_at")
    .or("key.like.printer_status:%,key.like.printer_status__%,key.like.printer_host:%,key.like.printer_host__%")
    .order("key", { ascending: true });

  const hostByPrinter = new Map<string, string>();
  for (const row of (printerRows ?? []) as PrinterRow[]) {
    const key = String(row.key ?? "");
    if (!key.startsWith("printer_host:")) continue;
    const name = key.replace(/^printer_host:/, "").trim();
    if (!name) continue;
    const host = String(row.unit ?? "").trim();
    if (host) hostByPrinter.set(name, host);
  }

  const printers = ((printerRows ?? []) as PrinterRow[])
    .filter((r) => String(r.key ?? "").startsWith("printer_status:"))
    .map((r) => ({
      key: String(r.key),
      name: printerNameFromKey(String(r.key)),
      location: locationLabelFromRow(r),
      status: statusLabelFromRow(r),
      host: hostByPrinter.get(printerNameFromKey(String(r.key))) ?? "",
      updatedAt: r.updated_at,
    }))
    .filter((p) => p.name.length > 0);

  return (
    <AppShell title="Printers" activeNav="printers">
      <div className="mx-auto w-full max-w-4xl grid gap-6">
        <div>
          <h1 className="text-2xl font-semibold">3D Printers</h1>
          <p className="mt-1 text-sm text-neutral-400">Manage printer availability shown on the dashboard.</p>
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

        <section className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
          {printerErr ? (
            <div className="rounded-md border border-red-900/40 bg-red-950/20 p-3 text-xs text-red-200">
              {printerErr.message}
            </div>
          ) : null}

          <form action={addOrUpdatePrinter} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_140px_180px_auto]">
            <input
              name="name"
              required
              placeholder="Printer name (e.g., Name/Bot#)"
              className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
            />
            <input
              name="host"
              placeholder="Hostname/IP (e.g., printer.local or 10.0.0.25)"
              className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
            />
            <select
              name="location"
              defaultValue="Austin"
              className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
            >
              <option value="Austin">Austin</option>
              <option value="PR">PR</option>
            </select>
            <select
              name="status"
              defaultValue="Available"
              className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
            >
              <option value="Available">Available</option>
              <option value="In Use">In Use</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Offline">Offline</option>
            </select>
            <button
              type="submit"
              className="h-10 rounded-md bg-white px-4 text-sm font-medium text-neutral-900 hover:bg-neutral-200"
            >
              Add Printer
            </button>
          </form>

          <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-950/60 text-left text-neutral-300">
                <tr className="border-b border-neutral-800">
                  <th className="px-3 py-2">Printer</th>
                  <th className="px-3 py-2">Hostname/IP</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Updated</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800 bg-neutral-950/30">
                {printers.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-neutral-500" colSpan={6}>
                      No printers configured yet.
                    </td>
                  </tr>
                ) : (
                  printers.map((p) => (
                    <tr key={p.key}>
                      <td className="px-3 py-2 text-neutral-100">{p.name}</td>
                      <td className="px-3 py-2 text-neutral-200">{p.host || "—"}</td>
                      <td className="px-3 py-2 text-neutral-200">{p.location}</td>
                      <td className="px-3 py-2">
                        <form action={addOrUpdatePrinter} className="flex gap-2">
                          <input type="hidden" name="name" value={p.name} />
                          <input
                            name="host"
                            defaultValue={p.host}
                            placeholder="Hostname/IP"
                            className="h-9 w-44 rounded-md border border-neutral-800 bg-neutral-950 px-2 text-sm text-neutral-100"
                          />
                          <select
                            name="location"
                            defaultValue={p.location}
                            className="h-9 rounded-md border border-neutral-800 bg-neutral-950 px-2 text-sm text-neutral-100"
                          >
                            <option value="Austin">Austin</option>
                            <option value="PR">PR</option>
                          </select>
                          <select
                            name="status"
                            defaultValue={p.status}
                            className="h-9 rounded-md border border-neutral-800 bg-neutral-950 px-2 text-sm text-neutral-100"
                          >
                            <option value="Available">Available</option>
                            <option value="In Use">In Use</option>
                            <option value="Maintenance">Maintenance</option>
                            <option value="Offline">Offline</option>
                          </select>
                          <button
                            type="submit"
                            className="h-9 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-xs text-neutral-100 hover:bg-neutral-800"
                          >
                            Save
                          </button>
                        </form>
                      </td>
                      <td className="px-3 py-2 text-neutral-400 text-xs">
                        {p.updatedAt ? new Date(p.updatedAt).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <form action={deletePrinter} className="inline-flex">
                          <input type="hidden" name="key" value={p.key} />
                          <button
                            type="submit"
                            className="h-9 rounded-md border border-red-900/40 bg-red-950/20 px-3 text-xs text-red-200 hover:bg-red-950/35"
                          >
                            Remove
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

async function addOrUpdatePrinter(formData: FormData) {
  "use server";
  const supabase = await createClient();

  try {
    const name = String(formData.get("name") ?? "").trim();
    const host = String(formData.get("host") ?? "").trim();
    const location = String(formData.get("location") ?? "").trim();
    const status = String(formData.get("status") ?? "").trim();

    if (!name) throw new Error("Printer name is required.");
    if (!PRINTER_LOCATION_OPTIONS.includes(location as any)) throw new Error("Printer location must be Austin or PR.");
    if (!status) throw new Error("Printer status is required.");

    const key = printerKeyFromName(name);
    const statusCode = statusCodeForLabel(status);
    const { error } = await supabase.from("cost_settings").upsert(
      {
        key,
        label: `Printer: ${name} | Location: ${location}`,
        unit: status,
        value: statusCode,
      },
      { onConflict: "key" }
    );

    if (error) throw new Error(error.message);

    if (host.length > 0) {
      const { error: hostErr } = await supabase.from("cost_settings").upsert(
        {
          key: printerHostKey(name),
          label: `Printer host for ${name}`,
          unit: host,
          value: 0,
        },
        { onConflict: "key" }
      );
      if (hostErr) throw new Error(hostErr.message);
    } else {
      const { error: clearHostErr } = await supabase
        .from("cost_settings")
        .delete()
        .eq("key", printerHostKey(name));
      if (clearHostErr) throw new Error(clearHostErr.message);
    }

    if (status !== PRINTER_STATUS_IN_USE) {
      const { error: clearAssignErr } = await supabase
        .from("cost_settings")
        .delete()
        .eq("key", printerAssignmentKey(name));
      if (clearAssignErr) throw new Error(clearAssignErr.message);
    }

    await recalculateLeadTimesForOpenRequests(supabase);

    revalidatePath("/dashboard");
    revalidatePath("/printers");
    revalidatePath("/settings");
    redirect("/printers?msg=Printer%20saved");
  } catch (e: any) {
    if (isRedirectError(e)) throw e;
    redirect(`/printers?err=${encodeURIComponent(e?.message ?? "Failed to save printer")}`);
  }
}

async function deletePrinter(formData: FormData) {
  "use server";
  const supabase = await createClient();

  try {
    const key = String(formData.get("key") ?? "").trim();
    if (!key) throw new Error("Missing printer key.");

    const name = printerNameFromKey(key);

    const { error } = await supabase.from("cost_settings").delete().eq("key", key);
    if (error) throw new Error(error.message);

    if (name) {
      const { error: clearAssignErr } = await supabase
        .from("cost_settings")
        .delete()
        .eq("key", printerAssignmentKey(name));
      if (clearAssignErr) throw new Error(clearAssignErr.message);

      const { error: clearHostErr } = await supabase
        .from("cost_settings")
        .delete()
        .eq("key", printerHostKey(name));
      if (clearHostErr) throw new Error(clearHostErr.message);
    }

    await recalculateLeadTimesForOpenRequests(supabase);

    revalidatePath("/dashboard");
    revalidatePath("/printers");
    revalidatePath("/settings");
    redirect("/printers?msg=Printer%20removed");
  } catch (e: any) {
    if (isRedirectError(e)) throw e;
    redirect(`/printers?err=${encodeURIComponent(e?.message ?? "Failed to delete printer")}`);
  }
}
