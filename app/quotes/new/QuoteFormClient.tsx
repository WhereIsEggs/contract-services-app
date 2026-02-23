"use client";

import { useEffect, useMemo, useState } from "react";

type MaterialOption = {
    id: string;
    name: string;
    category: string | null;
    is_active: boolean;
    price_per_lb: number; // <-- REQUIRED for preview
};

type CostSettings = Record<string, number>;

function toNum(v: any) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

// match your sheet/script behavior: ceil to 0.01 lb
function gramsToPoundsCeil2dp(grams: number) {
    if (!Number.isFinite(grams) || grams <= 0) return 0;
    return Math.ceil(grams * 0.00220462 * 100) / 100;
}

function money(n: number) {
    const v = Number.isFinite(n) ? n : 0;
    return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function QuoteFormClient({
    materials,
    settings,
    action,
    initialSvc,
    fromRequest,
    initialCustomerName,
    initialJobName,
}: {
    materials: MaterialOption[];
    settings: CostSettings; // <-- REQUIRED for preview
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

    const otherGridColsClass =
        otherSelectedCount <= 1
            ? "md:grid-cols-1"
            : otherSelectedCount === 2
                ? "md:grid-cols-2"
                : "md:grid-cols-3";

    useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            const target = e.target as HTMLElement | null;

            if (
                target &&
                target instanceof HTMLInputElement &&
                target.type === "number" &&
                document.activeElement === target
            ) {
                e.preventDefault();
            }
        };

        window.addEventListener("wheel", handleWheel, { passive: false });

        return () => {
            window.removeEventListener("wheel", handleWheel);
        };
    }, []);

    // =========================
    // Local state for live preview
    // =========================
    const [printTimeHours, setPrintTimeHours] = useState(0);

    const [scanLaborHours, setScanLaborHours] = useState(0);
    const [designLaborHours, setDesignLaborHours] = useState(0);
    const [testLaborHours, setTestLaborHours] = useState(0);

    const [material1Id, setMaterial1Id] = useState("");
    const [material1Grams, setMaterial1Grams] = useState(0);

    const [material2Id, setMaterial2Id] = useState("");
    const [material2Grams, setMaterial2Grams] = useState(0);

    const [supportRemovalTimeHrs, setSupportRemovalTimeHrs] = useState(0); // J2
    const [setupTimeHrs, setSetupTimeHrs] = useState(0); // K2
    const [adminTimeHrs, setAdminTimeHrs] = useState(0); // L2

    const getSetting = (key: string, fallback: number) => {
        const v = settings?.[key];
        return Number.isFinite(v) ? Number(v) : fallback;
    };

    const coerceBlankNumberToZero = (
        e: React.FocusEvent<HTMLInputElement>,
        setter?: (n: number) => void
    ) => {
        const raw = e.target.value.trim();

        if (raw === "") {
            e.target.value = "0";
            setter?.(0);
            return;
        }

        const n = Number(raw);
        if (!Number.isFinite(n)) {
            e.target.value = "0";
            setter?.(0);
            return;
        }

        e.target.value = String(n);
        setter?.(n);
    };

    const selectedMat1 = useMemo(
        () => materials.find((m) => m.id === material1Id) ?? null,
        [materials, material1Id]
    );
    const selectedMat2 = useMemo(
        () => materials.find((m) => m.id === material2Id) ?? null,
        [materials, material2Id]
    );

    const preview = useMemo(() => {
        // Defaults (no UI dropdowns)
        const defaultFailureRate = getSetting("default_failure_rate", 0.65); // I2 default 65%

        // Rates (Variables equivalents)
        const machineCostRate = getSetting("machine_cost_rate", 0); // D9
        const electricityCostRate = getSetting("electricity_cost_rate", 0); // D10
        const spaceConsumablesCostRate = getSetting("space_consumables_cost_rate", 0); // D11

        const supportRemovalBillableRate = getSetting("support_removal_billable_rate", 0);
        const supportRemovalInternalRate = getSetting("support_removal_internal_rate", 0);

        const machineSetupBillableRate = getSetting("machine_setup_billable_rate", 0);
        const machineSetupInternalRate = getSetting("machine_setup_internal_rate", 0);

        const adminFeesBillableRate = getSetting("admin_fees_billable_rate", 0);
        const adminFeesInternalRate = getSetting("admin_fees_internal_rate", 0);

        const monitoringTimePct = getSetting("monitoring_time_pct", 0);
        const monitoringBillableRate = getSetting("monitoring_billable_rate", 0);
        const monitoringInternalRate = getSetting("monitoring_internal_rate", 0);

        const preTaxSaleMarkup = getSetting("pre_tax_sale_markup", 0.65); // D18
        const discountRate = getSetting("discount_rate", 0.1); // D19
        const expeditedUpcharge = getSetting("expedited_upcharge", 0.1); // D20

        // Other services (billable) hourly rates (fallbacks match Quote Detail defaults)
        const scanningBillableRate = getSetting("scanning_billable_rate", 250);
        const designBillableRate = getSetting("design_billable_rate", 150);
        const testingBillableRate = getSetting("testing_billable_rate", 250);

        // Other services totals (billable)
        const scanningTotal = toNum(scanLaborHours) * scanningBillableRate;
        const designTotal = toNum(designLaborHours) * designBillableRate;
        const testingTotal = toNum(testLaborHours) * testingBillableRate;

        // lbs (ceil to 0.01)
        const lbs1 = gramsToPoundsCeil2dp(toNum(material1Grams));
        const lbs2 = gramsToPoundsCeil2dp(toNum(material2Grams));

        const rate1 = selectedMat1 ? toNum(selectedMat1.price_per_lb) : 0;
        const rate2 = selectedMat2 ? toNum(selectedMat2.price_per_lb) : 0;

        // Q2 = D2 * machineCostRate
        const Q2_machineCost = toNum(printTimeHours) * machineCostRate;

        // R2 = (lbs1*rate1 + lbs2*rate2) * 1.65
        const R2_materialUseCost = (lbs1 * rate1 + lbs2 * rate2) * 1.65;

        // S2 = D2*(electricity + space/consumables)
        const S2_elecSpaceCost =
            toNum(printTimeHours) * (electricityCostRate + spaceConsumablesCostRate);

        // T2 = SUM(Q2:S2)
        const T2_manufacturingCost = Q2_machineCost + R2_materialUseCost + S2_elecSpaceCost;

        // Billable labor fees (customer-facing rates)
        const W2_laborFees_billable =
            toNum(supportRemovalTimeHrs) * supportRemovalBillableRate +
            toNum(setupTimeHrs) * machineSetupBillableRate +
            toNum(adminTimeHrs) * adminFeesBillableRate +
            toNum(printTimeHours) * monitoringTimePct * monitoringBillableRate;

        // Internal labor cost (your cost basis)
        const W2_laborCost_internal =
            toNum(supportRemovalTimeHrs) * supportRemovalInternalRate +
            toNum(setupTimeHrs) * machineSetupInternalRate +
            toNum(adminTimeHrs) * adminFeesInternalRate +
            toNum(printTimeHours) * monitoringTimePct * monitoringInternalRate;

        // U2 = T2*(1+failure)
        const U2_withFailRate = T2_manufacturingCost * (1 + defaultFailureRate);

        // V (pre-tax manufacturing with sales markup): U * (1 + markup)
        const V_preTaxManufacturing = U2_withFailRate * (1 + preTaxSaleMarkup);

        // X (total price, no discount/expedite): keep existing behavior (billable labor added)
        const X_totalNoDiscount = V_preTaxManufacturing + W2_laborFees_billable;

        // Grand totals including other selected services (billable)
        const X_totalNoDiscount_all = X_totalNoDiscount + scanningTotal + designTotal + testingTotal;

        // Discount / expedite pricing
        const discounted = X_totalNoDiscount_all * (1 - discountRate);
        const expedited = X_totalNoDiscount_all * (1 + expeditedUpcharge);

        // Profit/margin here is still based on contract printing internal cost,
        // but uses the full quote total so totals stay aligned visually.
        const internalCost = U2_withFailRate + W2_laborCost_internal;
        const profit = X_totalNoDiscount_all - internalCost;
        const marginPct = X_totalNoDiscount_all > 0 ? profit / X_totalNoDiscount_all : 0;

        const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

        return {
            lbs1: round2(lbs1),
            lbs2: round2(lbs2),
            rate1: round2(rate1),
            rate2: round2(rate2),

            Q2_machineCost: round2(Q2_machineCost),
            R2_materialUseCost: round2(R2_materialUseCost),
            S2_elecSpaceCost: round2(S2_elecSpaceCost),
            T2_manufacturingCost: round2(T2_manufacturingCost),
            W2_laborFees_billable: round2(W2_laborFees_billable),
            W2_laborCost_internal: round2(W2_laborCost_internal),
            U2_withFailRate: round2(U2_withFailRate),
            V_preTaxManufacturing: round2(V_preTaxManufacturing),
            X_totalNoDiscount: round2(X_totalNoDiscount),

            internalCost: round2(internalCost),
            profit: round2(profit),
            marginPct, // keep as ratio (0.23 = 23%)

            scanningTotal: round2(scanningTotal),
            designTotal: round2(designTotal),
            testingTotal: round2(testingTotal),

            X_totalNoDiscount_all: round2(X_totalNoDiscount_all),

            scanningBillableRate,
            designBillableRate,
            testingBillableRate,

            discounted: round2(discounted),
            expedited: round2(expedited),

            defaultFailureRate,
            preTaxSaleMarkup,
            discountRate,
            expeditedUpcharge,
        };
    }, [
        settings,
        materials,
        selectedMat1,
        selectedMat2,
        printTimeHours,
        material1Grams,
        material2Grams,
        supportRemovalTimeHrs,
        setupTimeHrs,
        adminTimeHrs,
        scanLaborHours,
        designLaborHours,
        testLaborHours,
    ]);

    return (

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 shadow-sm">
            <style jsx global>{`
                /* Hide number input spinners (Chrome, Safari, Edge) */
                input[type="number"]::-webkit-outer-spin-button,
                input[type="number"]::-webkit-inner-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                }

                /* Hide number input spinners (Firefox) */
                input[type="number"] {
                    -moz-appearance: textfield;
                    appearance: textfield;
                }
            `}</style>

            <form action={action} className="grid gap-4">                {fromRequest ? <input type="hidden" name="from_request_id" value={fromRequest} /> : null}

                <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1">
                        <span className="text-xs text-neutral-400">Customer name</span>
                        <input
                            name="customer_name"
                            required
                            defaultValue={initialCustomerName ?? ""}
                            readOnly={Boolean(fromRequest)}
                            className={`w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${fromRequest ? "opacity-80 cursor-not-allowed" : ""
                                }`}
                        />
                    </label>

                    <label className="grid gap-1">
                        <span className="text-xs text-neutral-400">Request ID:</span>

                        {/* Keep submitting job_name even when the visible input is disabled */}
                        {fromRequest ? (
                            <input type="hidden" name="job_name" value={initialJobName ?? ""} />
                        ) : null}

                        <input
                            name="job_name"
                            required
                            defaultValue={initialJobName ?? ""}
                            disabled={Boolean(fromRequest)}
                            className={`w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${fromRequest ? "opacity-80 cursor-not-allowed" : ""
                                }`}
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
                                    onClick={() => setSvc((s) => ({ ...s, [svcDef.key]: !active }))}
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

                {/* Contract Printing */}
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
                                    onChange={(e) => setPrintTimeHours(toNum(e.target.value))}
                                    onBlur={(e) => coerceBlankNumberToZero(e, setPrintTimeHours)}
                                    className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                                            onChange={(e) => setMaterial1Id(e.target.value)}
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
                                            onChange={(e) => setMaterial1Grams(toNum(e.target.value))}
                                            onBlur={(e) => coerceBlankNumberToZero(e, setMaterial1Grams)}
                                            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                                            onChange={(e) => setMaterial2Id(e.target.value)}
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
                                            onChange={(e) => setMaterial2Grams(toNum(e.target.value))}
                                            onBlur={(e) => coerceBlankNumberToZero(e, setMaterial2Grams)}
                                            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </label>
                                </div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-3">
                                <div className="grid gap-1">
                                    <label htmlFor="support_removal_time_hours" className="text-xs text-neutral-400">
                                        Support removal time (hours)
                                    </label>
                                    <input
                                        id="support_removal_time_hours"
                                        name="support_removal_time_hours"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        defaultValue="0"
                                        onChange={(e) => setSupportRemovalTimeHrs(toNum(e.target.value))}
                                        onBlur={(e) => coerceBlankNumberToZero(e, setSupportRemovalTimeHrs)}
                                        className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                <div className="grid gap-1">
                                    <label htmlFor="setup_time_hours" className="text-xs text-neutral-400">
                                        Setup time (hours)
                                    </label>
                                    <input
                                        id="setup_time_hours"
                                        name="setup_time_hours"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        defaultValue="0"
                                        onChange={(e) => setSetupTimeHrs(toNum(e.target.value))}
                                        onBlur={(e) => coerceBlankNumberToZero(e, setSetupTimeHrs)}
                                        className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                <div className="grid gap-1">
                                    <label htmlFor="admin_time_hours" className="text-xs text-neutral-400">
                                        Admin time (hours)
                                    </label>
                                    <input
                                        id="admin_time_hours"
                                        name="admin_time_hours"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        defaultValue="0"
                                        onChange={(e) => setAdminTimeHrs(toNum(e.target.value))}
                                        onBlur={(e) => coerceBlankNumberToZero(e, setAdminTimeHrs)}
                                        className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>                        </div>
                    </div>
                )}

                {/* Other services hours */}
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
                                    onChange={(e) => setScanLaborHours(toNum(e.target.value))}
                                    onBlur={(e) => coerceBlankNumberToZero(e, setScanLaborHours)}
                                    className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100" />
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
                                    onChange={(e) => setDesignLaborHours(toNum(e.target.value))}
                                    onBlur={(e) => coerceBlankNumberToZero(e, setDesignLaborHours)}
                                    className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100" />
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
                                    onChange={(e) => setTestLaborHours(toNum(e.target.value))}
                                    onBlur={(e) => coerceBlankNumberToZero(e, setTestLaborHours)}
                                    className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100" />
                            </label>
                        )}
                    </div>
                )}

                {/* ✅ Preview moved directly above Notes */}
                {svc.contract_printing && (
                    <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                        <div className="mb-2 text-sm font-medium text-neutral-200">Preview</div>

                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                                <div className="text-sm text-neutral-300">Material 1</div>
                                <div className="mt-1 text-lg font-semibold text-white">
                                    {preview.lbs1.toFixed(2)} lb @ {money(preview.rate1)}/lb
                                </div>
                                <div className="text-sm text-neutral-400">
                                    (includes 1.65 material factor)
                                </div>
                            </div>

                            <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                                <div className="text-sm text-neutral-300">Material 2</div>
                                <div className="mt-1 text-lg font-semibold text-white">
                                    {preview.lbs2.toFixed(2)} lb @ {money(preview.rate2)}/lb
                                </div>
                                <div className="text-sm text-neutral-400">
                                    (includes 1.65 material factor)
                                </div>
                            </div>
                        </div>

                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                            <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                                <div className="text-sm text-neutral-300">Manufacturing cost</div>
                                <div className="mt-1 text-lg font-semibold text-white">{money(preview.T2_manufacturingCost)}</div>
                                <div className="text-xs text-neutral-500">
                                    machine + material + electricity/space
                                </div>
                            </div>

                            {svc.scanning ? (
                                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                                    <div className="text-sm text-neutral-300">3D Scanning</div>
                                    <div className="mt-1 text-lg font-semibold text-white">
                                        {money(preview.scanningTotal)}
                                    </div>
                                    <div className="text-xs text-neutral-500">
                                        {scanLaborHours.toFixed(2)} hrs @ {money(preview.scanningBillableRate)}/hr
                                    </div>
                                </div>
                            ) : null}

                            {svc.design ? (
                                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                                    <div className="text-sm text-neutral-300">3D Design</div>
                                    <div className="mt-1 text-lg font-semibold text-white">
                                        {money(preview.designTotal)}
                                    </div>
                                    <div className="text-xs text-neutral-500">
                                        {designLaborHours.toFixed(2)} hrs @ {money(preview.designBillableRate)}/hr
                                    </div>
                                </div>
                            ) : null}

                            {svc.testing ? (
                                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                                    <div className="text-sm text-neutral-300">Material Testing</div>
                                    <div className="mt-1 text-lg font-semibold text-white">
                                        {money(preview.testingTotal)}
                                    </div>
                                    <div className="text-xs text-neutral-500">
                                        {testLaborHours.toFixed(2)} hrs @ {money(preview.testingBillableRate)}/hr
                                    </div>
                                </div>
                            ) : null}

                            <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                                <div className="text-sm text-neutral-300">Labor fees</div>
                                <div className="mt-1 text-lg font-semibold text-white">{money(preview.W2_laborFees_billable)}</div>
                                <div className="text-xs text-neutral-500">
                                    support + setup + admin + monitoring
                                </div>
                            </div>

                            <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                                <div className="text-sm text-neutral-300">With failure rate</div>
                                <div className="mt-1 text-lg font-semibold text-white">{money(preview.U2_withFailRate)}</div>
                                <div className="text-xs text-neutral-500">
                                    failure default {(preview.defaultFailureRate * 100).toFixed(0)}%
                                </div>
                            </div>

                            <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                                <div className="text-sm text-neutral-300">Internal cost</div>
                                <div className="mt-1 text-lg font-semibold text-white">
                                    {money(preview.U2_withFailRate + preview.W2_laborCost_internal)}
                                </div>
                                <div className="text-xs text-neutral-500">
                                    internal cost basis (materials + machine + labor allocation)
                                </div>
                            </div>

                            <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                                <div className="text-sm text-neutral-300">Total price (no discount)</div>
                                <div className="mt-1 text-lg font-semibold text-white">{money(preview.X_totalNoDiscount_all)}
                                </div>
                                <div className="text-xs text-neutral-500">
                                    markup {(preview.preTaxSaleMarkup * 100).toFixed(0)}%
                                </div>
                            </div>

                            <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                                <div className="text-sm text-neutral-300">Profit / Margin</div>
                                <div className="mt-1 text-lg font-semibold text-white">
                                    {money(preview.profit)}
                                </div>
                                <div className="text-xs text-neutral-500">
                                    margin {(preview.marginPct * 100).toFixed(1)}%
                                </div>
                            </div>


                            <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                                <div className="text-sm text-neutral-300">Discounted / Expedited</div>
                                <div className="mt-1 text-sm text-neutral-200">
                                    Discount ({(preview.discountRate * 100).toFixed(0)}%):{" "}
                                    <span className="font-semibold text-white">{money(preview.discounted)}</span>
                                </div>
                                <div className="text-sm text-neutral-200">
                                    Expedited ({(preview.expeditedUpcharge * 100).toFixed(0)}%):{" "}
                                    <span className="font-semibold text-white">{money(preview.expedited)}</span>
                                </div>
                            </div>
                        </div>

                        <p className="mt-3 text-xs text-neutral-500">
                            This preview is live and does not affect saved values until you click “Save Quote”.
                        </p>
                    </div>
                )}

                <label className="grid gap-1">
                    <span className="text-xs text-neutral-400">Notes</span>
                    <textarea
                        name="notes"
                        rows={4}
                        className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
