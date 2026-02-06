"use client";

import { useEffect, useMemo, useState } from "react";

type MaterialOption = {
    id: string;
    name: string;
    category: string | null;
    is_active: boolean;
};

export default function QuoteFormClient({
    materials,
    action,
    initialSvc,
    fromRequest,
    initialCustomerName,
    initialJobName,
}: {
    materials: MaterialOption[];
    action: (formData: FormData) => void;
    initialSvc: {
        contract_printing: boolean;
        scanning: boolean;
        design: boolean;
        testing: boolean;
    };
    fromRequest: string;
    initialCustomerName?: string;
    initialJobName?: string;

}) {
    const [svc, setSvc] = useState(() => initialSvc);

    useEffect(() => {
        setSvc(initialSvc);
    }, [initialSvc]);

    const otherSelectedCount = useMemo(() => {
        return Number(svc.scanning) + Number(svc.design) + Number(svc.testing);
    }, [svc.scanning, svc.design, svc.testing]);

    // Row sizing rule you gave:
    // 1 service -> full row (1 col)
    // 2 services -> half/half (2 cols)
    // 3 services -> leave as is (3 cols)
    const otherGridColsClass =
        otherSelectedCount <= 1
            ? "md:grid-cols-1"
            : otherSelectedCount === 2
                ? "md:grid-cols-2"
                : "md:grid-cols-3";

    return (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 shadow-sm">
            <form action={action} className="grid gap-4">
                {fromRequest ? (
                    <input type="hidden" name="from_request_id" value={fromRequest} />
                ) : null}
                <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1">
                        <span className="text-xs text-neutral-400">Customer name</span>
                        <input
                            name="customer_name"
                            required
                            defaultValue={initialCustomerName ?? ""}
                            readOnly={Boolean(fromRequest)}
                            className={`h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 ${fromRequest ? "opacity-80 cursor-not-allowed" : ""
                                }`}
                        />
                    </label>

                    <label className="grid gap-1">
                        <span className="text-xs text-neutral-400">Request ID:</span>
                        <input
                            name="job_name"
                            required
                            defaultValue={initialJobName ?? ""}
                            className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
                        />
                    </label>
                </div>

                {/* Services */}
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                    <div className="mb-2 text-sm font-medium text-neutral-200">Services to quote</div>

                    <div className="grid gap-2 md:grid-cols-2">
                        {[
                            { key: "contract_printing", label: "Contract Printing", name: "svc_contract_printing" },
                            { key: "scanning", label: "3D Scanning", name: "svc_3d_scanning" },
                            { key: "design", label: "3D Design", name: "svc_3d_design" },
                            { key: "testing", label: "Material Testing", name: "svc_material_testing" },
                        ].map((svcDef) => {
                            const active = (svc as any)[svcDef.key];

                            return (
                                <button
                                    key={svcDef.key}
                                    type="button"
                                    onClick={() =>
                                        setSvc((s) => ({ ...s, [svcDef.key]: !active }))
                                    }
                                    className={`h-10 rounded-md border px-3 text-sm font-medium transition 
                                        ${active
                                            ? "bg-blue-600 border-blue-500 text-white"
                                            : "bg-neutral-950 border-neutral-800 text-neutral-200 hover:bg-neutral-900"
                                        }`}
                                >
                                    {svcDef.label}
                                </button>
                            );
                        })}
                    </div>

                    <input type="hidden" name="svc_contract_printing" value={svc.contract_printing ? "on" : ""} />
                    <input type="hidden" name="svc_3d_scanning" value={svc.scanning ? "on" : ""} />
                    <input type="hidden" name="svc_3d_design" value={svc.design ? "on" : ""} />
                    <input type="hidden" name="svc_material_testing" value={svc.testing ? "on" : ""} />


                    <div className="mt-3 text-xs text-neutral-500">
                        Sections below only appear when the corresponding service is checked.
                    </div>
                </div>

                {/* Contract Printing (only if checked) */}
                {svc.contract_printing && (
                    <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                        <div className="mb-2 text-sm font-medium text-neutral-200">Contract Printing details</div>

                        <div className="grid gap-3 md:grid-cols-2">
                            <label className="grid gap-1">
                                <span className="text-xs text-neutral-400">Print time (hours)</span>
                                <input
                                    name="print_time_hours"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    defaultValue="0"
                                    className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
                                />
                            </label>
                        </div>

                        <div className="mt-3 grid gap-3">
                            <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                                <div className="mb-2 text-sm font-medium text-neutral-200">Material 1</div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <label className="grid gap-1">
                                        <span className="text-xs text-neutral-400">Material</span>
                                        <select
                                            name="material1_id"
                                            className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
                                            defaultValue=""
                                        >
                                            <option value="">— Select —</option>
                                            {materials.map((m) => (
                                                <option key={m.id} value={m.id}>
                                                    {m.category ? `${m.category} — ` : ""}
                                                    {m.name}
                                                </option>
                                            ))}
                                        </select>
                                    </label>

                                    <label className="grid gap-1">
                                        <span className="text-xs text-neutral-400">Grams</span>
                                        <input
                                            name="material1_grams"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            defaultValue="0"
                                            className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
                                        />
                                    </label>
                                </div>
                            </div>

                            <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                                <div className="mb-2 text-sm font-medium text-neutral-200">Material 2 (optional)</div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <label className="grid gap-1">
                                        <span className="text-xs text-neutral-400">Material</span>
                                        <select
                                            name="material2_id"
                                            className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
                                            defaultValue=""
                                        >
                                            <option value="">— None —</option>
                                            {materials.map((m) => (
                                                <option key={m.id} value={m.id}>
                                                    {m.category ? `${m.category} — ` : ""}
                                                    {m.name}
                                                </option>
                                            ))}
                                        </select>
                                    </label>

                                    <label className="grid gap-1">
                                        <span className="text-xs text-neutral-400">Grams</span>
                                        <input
                                            name="material2_grams"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            defaultValue="0"
                                            className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Other services hours: only show selected services, and resize row */}
                {otherSelectedCount > 0 && (
                    <div className={`grid gap-3 ${otherGridColsClass}`}>
                        {svc.scanning && (
                            <label className="grid gap-1 rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                                <span className="text-xs text-neutral-400">Scanning labor hours</span>
                                <input
                                    name="scan_labor_hours"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    defaultValue="0"
                                    className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
                                />
                            </label>
                        )}

                        {svc.design && (
                            <label className="grid gap-1 rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                                <span className="text-xs text-neutral-400">Design labor hours</span>
                                <input
                                    name="design_labor_hours"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    defaultValue="0"
                                    className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
                                />
                            </label>
                        )}

                        {svc.testing && (
                            <label className="grid gap-1 rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                                <span className="text-xs text-neutral-400">Testing labor hours</span>
                                <input
                                    name="test_labor_hours"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    defaultValue="0"
                                    className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
                                />
                            </label>
                        )}
                    </div>
                )}

                <label className="grid gap-1">
                    <span className="text-xs text-neutral-400">Notes</span>
                    <textarea
                        name="notes"
                        rows={4}
                        className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
                        placeholder="Any special considerations, assumptions, file notes, etc."
                    />
                </label>

                <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                        type="submit"
                        className="h-10 rounded-md bg-white px-4 text-sm font-medium text-neutral-900 hover:bg-neutral-200"
                    >
                        Save Quote
                    </button>
                </div>
            </form>
        </div>
    );
}
