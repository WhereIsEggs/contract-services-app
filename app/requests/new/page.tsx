import { createClient } from "@/app/lib/supabase/server";
import { createRequest } from "@/app/actions";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";

export default async function NewRequestPage() {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }

    return (
        <AppShell title="New Request">
            <div className="bg-neutral-900 rounded-lg shadow-lg p-6">
                <h1 className="text-3xl font-bold">New Service Request</h1>
                <p className="mt-2 text-sm text-neutral-400">
                    Submit a new contract services request for tracking and assignment.
                </p>

                <hr className="my-8 border-neutral-800" />

                <form
                    action={async (formData) => {
                        "use server";
                        await createRequest(formData);
                    }}
                    className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 shadow-sm grid gap-5"
                >
                    <div className="grid gap-1">
                        <label className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                            Customer Name
                        </label>
                        <input
                            name="customer_name"
                            placeholder="Acme Corp"
                            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <fieldset className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
                        <legend className="px-1 text-sm font-medium text-neutral-200">
                            Services Requested
                        </legend>

                        <div className="mt-3 grid gap-2">
                            <label className="flex items-center gap-2 text-sm text-neutral-200 hover:text-white transition-colors">
                                <input
                                    type="checkbox"
                                    name="svc_scan"
                                    className="h-4 w-4 rounded border-neutral-600 bg-neutral-950"
                                />
                                3D Scanning
                            </label>

                            <label className="flex items-center gap-2 text-sm text-neutral-200 hover:text-white transition-colors">
                                <input
                                    type="checkbox"
                                    name="svc_design"
                                    className="h-4 w-4 rounded border-neutral-600 bg-neutral-950"
                                />
                                3D Design
                            </label>

                            <label className="flex items-center gap-2 text-sm text-neutral-200 hover:text-white transition-colors">
                                <input
                                    type="checkbox"
                                    name="svc_print"
                                    className="h-4 w-4 rounded border-neutral-600 bg-neutral-950"
                                />
                                Contract Print
                            </label>
                        </div>
                    </fieldset>

                    <div className="grid gap-1">
                        <label className="text-sm font-medium text-neutral-200">
                            Project Details
                        </label>
                        <textarea
                            name="project_details"
                            placeholder="Customer needs a part scanned, cleaned up in CAD, then printed..."
                            rows={5}
                            className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <button
                        type="submit"
                        className="mt-4 inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-900 transition"
                    >
                        Submit Request
                    </button>
                </form>
            </div>
        </AppShell>
    );
}
