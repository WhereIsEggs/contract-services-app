"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CreateRequestState } from "@/app/actions";

export default function NewRequestFormClient({
    action,
}: {
    action: (prevState: CreateRequestState, formData: FormData) => Promise<CreateRequestState>;
}) {
    const [state, formAction] = useActionState<CreateRequestState, FormData>(action, {
        ok: false,
        errors: [],
    });
    const router = useRouter();

    const [isPending, startTransition] = useTransition();


    const hasErrors = (state?.errors?.length ?? 0) > 0;

    useEffect(() => {
        if (state?.ok && state.requestId) {
            router.push(`/requests/${state.requestId}`);
        }
    }, [state?.ok, state?.requestId, router]);


    const [customerName, setCustomerName] = useState("");
    const [projectDetails, setProjectDetails] = useState("");
    const [svcScan, setSvcScan] = useState(false);
    const [svcDesign, setSvcDesign] = useState(false);
    const [svcPrint, setSvcPrint] = useState(false);


    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                startTransition(() => formAction(fd));
            }}
            className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 shadow-sm grid gap-5"
        >
            {hasErrors ? (
                <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
                    <div className="font-medium text-red-100">Fix the issues below and try again.</div>
                    <ul className="mt-2 list-disc pl-5 space-y-1">
                        {state.errors.map((msg, idx) => (
                            <li key={idx}>{msg}</li>
                        ))}
                    </ul>
                </div>
            ) : null}

            <div className="grid gap-1">
                <label className="text-sm font-medium text-neutral-200">
                    Customer Name <span className="text-red-400">*</span>
                </label>
                <input
                    name="customer_name"
                    placeholder="Acme Corp"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            <fieldset className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
                <legend className="px-1 text-sm font-medium text-neutral-200">Services Requested</legend>

                <div className="mt-3 grid gap-2">
                    <label className="flex items-center gap-2 text-sm text-neutral-200 hover:text-white transition-colors">
                        <input
                            type="checkbox"
                            name="svc_scan"
                            checked={svcScan}
                            onChange={(e) => setSvcScan(e.target.checked)}
                            className="h-4 w-4 rounded border-neutral-600 bg-neutral-950"
                        />
                        3D Scanning
                    </label>

                    <label className="flex items-center gap-2 text-sm text-neutral-200 hover:text-white transition-colors">
                        <input
                            type="checkbox"
                            name="svc_design"
                            checked={svcDesign}
                            onChange={(e) => setSvcDesign(e.target.checked)}
                            className="h-4 w-4 rounded border-neutral-600 bg-neutral-950"
                        />
                        3D Design
                    </label>

                    <label className="flex items-center gap-2 text-sm text-neutral-200 hover:text-white transition-colors">
                        <input
                            type="checkbox"
                            name="svc_print"
                            checked={svcPrint}
                            onChange={(e) => setSvcPrint(e.target.checked)}
                            className="h-4 w-4 rounded border-neutral-600 bg-neutral-950"
                        />
                        Contract Print
                    </label>
                </div>
            </fieldset>

            <div className="grid gap-1">
                <label className="text-sm font-medium text-neutral-200">
                    Project Details <span className="text-red-400">*</span>
                </label>
                <textarea
                    name="project_details"
                    placeholder="Customer needs a part scanned, cleaned up in CAD, then printed..."
                    rows={5}
                    value={projectDetails}
                    onChange={(e) => setProjectDetails(e.target.value)}
                    className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
            </div>

            <button
                type="submit"
                disabled={isPending}
                className="mt-4 inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-900 transition disabled:opacity-60"
            >
                Submit Request
            </button>
        </form>
    );
}
