"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createMaterialReturningRow } from "@/app/actions";

type MaterialOption = {
    id: string;
    name: string;
    category: string | null;
    is_active: boolean;
    price_per_lb: number;
};

type CostSettings = Record<string, number>;

function toNum(v: any) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

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
    settings: CostSettings;
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

    const router = useRouter();

    const [jobName, setJobName] = useState(initialJobName ?? "");

    useEffect(() => {
        setJobName(initialJobName ?? "");
    }, [initialJobName]);

    const [materialsState, setMaterialsState] = useState<MaterialOption[]>(() => materials);

    useEffect(() => {
        setMaterialsState(materials);
    }, [materials]);

    const ADD_NEW_VALUE = "__add_new_material__" as const;

    const [addMatOpen, setAddMatOpen] = useState(false);
    const [addMatTarget, setAddMatTarget] = useState<"material1" | "material2">("material1");
    const [addMatError, setAddMatError] = useState<string | null>(null);
    const [addMatSaving, setAddMatSaving] = useState(false);

    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") setAddMatOpen(false);
        }
        if (addMatOpen) window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [addMatOpen]);

    function sortMaterials(list: MaterialOption[]) {
        return [...list].sort((a, b) => {
            const ac = (a.category ?? "").toLowerCase();
            const bc = (b.category ?? "").toLowerCase();
            if (ac !== bc) return ac.localeCompare(bc);
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });
    }

    function openAddMaterialModal(target: "material1" | "material2") {
        setAddMatTarget(target);
        setAddMatError(null);
        setAddMatOpen(true);
    }

    const anySvcSelected =
        svc.contract_printing || svc.scanning || svc.design || svc.testing;

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

    const [printTimeHours, setPrintTimeHours] = useState(0);
    const [scanLaborHours, setScanLaborHours] = useState(0);
    const [designLaborHours, setDesignLaborHours] = useState(0);
    const [testLaborHours, setTestLaborHours] = useState(0);

    const [material1Id, setMaterial1Id] = useState("");
    const [material1Grams, setMaterial1Grams] = useState(0);

    const [material2Id, setMaterial2Id] = useState("");
    const [material2Grams, setMaterial2Grams] = useState(0);

    const [supportRemovalTimeHrs, setSupportRemovalTimeHrs] = useState(0);
    const [setupTimeHrs, setSetupTimeHrs] = useState(0);
    const [adminTimeHrs, setAdminTimeHrs] = useState(0);

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
        () => materialsState.find((m) => m.id === material1Id) ?? null,
        [materialsState, material1Id]
    );
    const selectedMat2 = useMemo(
        () => materialsState.find((m) => m.id === material2Id) ?? null,
        [materialsState, material2Id]
    );

    const preview = useMemo(() => {
        const defaultFailureRate = getSetting("default_failure_rate", 0.65);

        const machineCostRate = getSetting("machine_cost_rate", 0);
        const electricityCostRate = getSetting("electricity_cost_rate", 0);
        const spaceConsumablesCostRate = getSetting("space_consumables_cost_rate", 0);

        const supportRemovalBillableRate = getSetting("support_removal_billable_rate", 0);
        const supportRemovalInternalRate = getSetting("support_removal_internal_rate", 0);

        const machineSetupBillableRate = getSetting("machine_setup_billable_rate", 0);
        const machineSetupInternalRate = getSetting("machine_setup_internal_rate", 0);

        const adminFeesBillableRate = getSetting("admin_fees_billable_rate", 0);
        const adminFeesInternalRate = getSetting("admin_fees_internal_rate", 0);

        const monitoringTimePct = getSetting("monitoring_time_pct", 0);
        const monitoringBillableRate = getSetting("monitoring_billable_rate", 0);
        const monitoringInternalRate = getSetting("monitoring_internal_rate", 0);

        const preTaxSaleMarkup = getSetting("pre_tax_sale_markup", 0.65);
        const discountRate = getSetting("discount_rate", 0.1);
        const expeditedUpcharge = getSetting("expedited_upcharge", 0.1);

        const scanningBillableRate = getSetting("scanning_billable_rate", 250);
        const designBillableRate = getSetting("design_billable_rate", 150);
        const testingBillableRate = getSetting("testing_billable_rate", 250);

        const scanningInternalRate = getSetting("scanning_internal_rate", 0);
        const designInternalRate = getSetting("design_internal_rate", 0);
        const testingInternalRate = getSetting("testing_internal_rate", 0);

        const scanningTotal = toNum(scanLaborHours) * scanningBillableRate;
        const designTotal = toNum(designLaborHours) * designBillableRate;
        const testingTotal = toNum(testLaborHours) * testingBillableRate;

        const scanningInternalTotal = toNum(scanLaborHours) * scanningInternalRate;
        const designInternalTotal = toNum(designLaborHours) * designInternalRate;
        const testingInternalTotal = toNum(testLaborHours) * testingInternalRate;

        const lbs1 = gramsToPoundsCeil2dp(toNum(material1Grams));
        const lbs2 = gramsToPoundsCeil2dp(toNum(material2Grams));

        const rate1 = selectedMat1 ? toNum(selectedMat1.price_per_lb) : 0;
        const rate2 = selectedMat2 ? toNum(selectedMat2.price_per_lb) : 0;

        const Q2_machineCost = toNum(printTimeHours) * machineCostRate;
        const R2_materialUseCost = (lbs1 * rate1 + lbs2 * rate2) * 1.65;
        const R2_materialUseCost_internal = lbs1 * rate1 + lbs2 * rate2;

        const S2_elecSpaceCost =
            toNum(printTimeHours) * (electricityCostRate + spaceConsumablesCostRate);

        const T2_manufacturingCost = Q2_machineCost + R2_materialUseCost + S2_elecSpaceCost;
        const T2_manufacturingCost_internal =
            Q2_machineCost + R2_materialUseCost_internal + S2_elecSpaceCost;

        const W2_laborFees_billable =
            toNum(supportRemovalTimeHrs) * supportRemovalBillableRate +
            toNum(setupTimeHrs) * machineSetupBillableRate +
            toNum(adminTimeHrs) * adminFeesBillableRate +
            toNum(printTimeHours) * monitoringTimePct * monitoringBillableRate;

        const W2_laborCost_internal =
            toNum(supportRemovalTimeHrs) * supportRemovalInternalRate +
            toNum(setupTimeHrs) * machineSetupInternalRate +
            toNum(adminTimeHrs) * adminFeesInternalRate +
            toNum(printTimeHours) * monitoringTimePct * monitoringInternalRate;

        const U2_withFailRate = T2_manufacturingCost * (1 + defaultFailureRate);
        const U2_withFailRate_internal = T2_manufacturingCost_internal * (1 + defaultFailureRate);

        const V_preTaxManufacturing = U2_withFailRate * (1 + preTaxSaleMarkup);
        const X_totalNoDiscount = V_preTaxManufacturing + W2_laborFees_billable;
        const X_totalNoDiscount_all = X_totalNoDiscount + scanningTotal + designTotal + testingTotal;

        const discounted = X_totalNoDiscount_all * (1 - discountRate);
        const expedited = X_totalNoDiscount_all * (1 + expeditedUpcharge);

        const contractPrintingInternalCost = U2_withFailRate_internal + W2_laborCost_internal;

        const internalCostAll =
            (svc.contract_printing ? contractPrintingInternalCost : 0) +
            (svc.scanning ? scanningInternalTotal : 0) +
            (svc.design ? designInternalTotal : 0) +
            (svc.testing ? testingInternalTotal : 0); const profit = X_totalNoDiscount_all - internalCostAll;
        const marginPct = X_totalNoDiscount_all > 0 ? profit / X_totalNoDiscount_all : 0;

        const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

        return {
            lbs1: round2(lbs1),
            lbs2: round2(lbs2),
            rate1: round2(rate1),
            rate2: round2(rate2),

            Q2_machineCost: round2(Q2_machineCost),
            R2_materialUseCost: round2(R2_materialUseCost),
            R2_materialUseCost_internal: round2(R2_materialUseCost_internal),
            S2_elecSpaceCost: round2(S2_elecSpaceCost),
            T2_manufacturingCost: round2(T2_manufacturingCost),
            T2_manufacturingCost_internal: round2(T2_manufacturingCost_internal),
            W2_laborFees_billable: round2(W2_laborFees_billable),
            W2_laborCost_internal: round2(W2_laborCost_internal),
            U2_withFailRate: round2(U2_withFailRate),
            U2_withFailRate_internal: round2(U2_withFailRate_internal),
            V_preTaxManufacturing: round2(V_preTaxManufacturing),
            X_totalNoDiscount: round2(X_totalNoDiscount),

            contractPrintingInternalCost: round2(contractPrintingInternalCost),
            internalCostAll: round2(internalCostAll),
            scanningInternalTotal: round2(scanningInternalTotal),
            designInternalTotal: round2(designInternalTotal),
            testingInternalTotal: round2(testingInternalTotal), profit: round2(profit),
            marginPct,

            scanningTotal: round2(scanningTotal),
            designTotal: round2(designTotal),
            testingTotal: round2(testingTotal),

            X_totalNoDiscount_all: round2(X_totalNoDiscount_all),

            scanningBillableRate,
            designBillableRate,
            testingBillableRate,
            scanningInternalRate,
            designInternalRate,
            testingInternalRate,

            discounted: round2(discounted),
            expedited: round2(expedited),

            defaultFailureRate,
            preTaxSaleMarkup,
            discountRate,
            expeditedUpcharge,
        };
    }, [
        svc,
        settings,
        materialsState,
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
                input[type="number"]::-webkit-outer-spin-button,
                input[type="number"]::-webkit-inner-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                }

                input[type="number"] {
                    -moz-appearance: textfield;
                    appearance: textfield;
                }
            `}</style>

            <form action={action} className="grid gap-4">
                {fromRequest ? <input type="hidden" name="from_request_id" value={fromRequest} /> : null}

                <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1">
                        <span className="text-xs text-neutral-400">Customer name</span>
                        <input
                            name="customer_name"
                            required
                            defaultValue={initialCustomerName ?? ""}
                            readOnly={Boolean(fromRequest)}
                            className={`w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${fromRequest ? "opacity-80 cursor-not-allowed" : ""}`}
                        />
                    </label>

                    <label className="grid gap-1">
                        <span className="text-xs text-neutral-400">Request ID:</span>

                        <input
                            name="job_name"
                            required
                            value={jobName}
                            onChange={(e) => setJobName(e.target.value)}
                            readOnly={Boolean(fromRequest)}
                            className={`w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${fromRequest ? "opacity-80 cursor-not-allowed" : ""}`}
                        />
                    </label>
                </div>

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

                {svc.contract_printing && (
                    <div className="grid gap-3">
                        {/* Times */}
                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                            {/* Print time */}
                            <label className="grid min-w-0 gap-1 rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                                <span className="text-xs text-neutral-400">Print time (hours)</span>
                                <input
                                    name="print_time_hours"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    defaultValue="0"
                                    onChange={(e) => setPrintTimeHours(toNum(e.target.value))}
                                    onBlur={(e) => coerceBlankNumberToZero(e, setPrintTimeHours)}
                                    className="h-10 w-full min-w-0 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </label>

                            {/* Support removal */}
                            <label className="grid min-w-0 gap-1 rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                                <span className="text-xs text-neutral-400">Support removal (hours)</span>
                                <input
                                    name="support_removal_time_hours"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    defaultValue="0"
                                    onChange={(e) => setSupportRemovalTimeHrs(toNum(e.target.value))}
                                    onBlur={(e) => coerceBlankNumberToZero(e, setSupportRemovalTimeHrs)}
                                    className="h-10 w-full min-w-0 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </label>

                            {/* Setup */}
                            <label className="grid min-w-0 gap-1 rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                                <span className="text-xs text-neutral-400">Setup time (hours)</span>
                                <input
                                    name="setup_time_hours"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    defaultValue="0"
                                    onChange={(e) => setSetupTimeHrs(toNum(e.target.value))}
                                    onBlur={(e) => coerceBlankNumberToZero(e, setSetupTimeHrs)}
                                    className="h-10 w-full min-w-0 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </label>

                            {/* Admin */}
                            <label className="grid min-w-0 gap-1 rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                                <span className="text-xs text-neutral-400">Admin time (hours)</span>
                                <input
                                    name="admin_time_hours"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    defaultValue="0"
                                    onChange={(e) => setAdminTimeHrs(toNum(e.target.value))}
                                    onBlur={(e) => coerceBlankNumberToZero(e, setAdminTimeHrs)}
                                    className="h-10 w-full min-w-0 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </label>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                                <div className="mb-2 text-sm font-medium text-neutral-200">Material 1</div>
                                <div className="grid gap-2">
                                    <label className="grid gap-1">
                                        <span className="text-xs text-neutral-400">Material</span>
                                        <select
                                            name="material1_id"
                                            value={material1Id}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                if (value === ADD_NEW_VALUE) {
                                                    openAddMaterialModal("material1");
                                                    return;
                                                }
                                                setMaterial1Id(value);
                                            }}
                                            className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="">Select material</option>
                                            {sortMaterials(
                                                materialsState.filter(
                                                    (m) => m.is_active || m.id === material1Id || m.id === material2Id
                                                )
                                            ).map((m) => (
                                                <option key={m.id} value={m.id}>
                                                    {m.category ? `${m.category} - ${m.name}` : m.name}
                                                </option>
                                            ))}
                                            <option value={ADD_NEW_VALUE}>+ Add new material…</option>
                                        </select>
                                    </label>

                                    <label className="grid gap-1">
                                        <span className="text-xs text-neutral-400">Usage (grams)</span>
                                        <input
                                            name="material1_grams"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            defaultValue="0"
                                            onChange={(e) => setMaterial1Grams(toNum(e.target.value))}
                                            onBlur={(e) => coerceBlankNumberToZero(e, setMaterial1Grams)}
                                            className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </label>
                                </div>
                            </div>

                            <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                                <div className="mb-2 text-sm font-medium text-neutral-200">Material 2</div>
                                <div className="grid gap-2">
                                    <label className="grid gap-1">
                                        <span className="text-xs text-neutral-400">Material</span>
                                        <select
                                            name="material2_id"
                                            value={material2Id}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                if (value === ADD_NEW_VALUE) {
                                                    openAddMaterialModal("material2");
                                                    return;
                                                }
                                                setMaterial2Id(value);
                                            }}
                                            className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="">Select material</option>
                                            {sortMaterials(
                                                materialsState.filter(
                                                    (m) => m.is_active || m.id === material1Id || m.id === material2Id
                                                )
                                            ).map((m) => (
                                                <option key={m.id} value={m.id}>
                                                    {m.category ? `${m.category} - ${m.name}` : m.name}
                                                </option>
                                            ))}
                                            <option value={ADD_NEW_VALUE}>+ Add new material…</option>
                                        </select>
                                    </label>

                                    <label className="grid gap-1">
                                        <span className="text-xs text-neutral-400">Usage (grams)</span>
                                        <input
                                            name="material2_grams"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            defaultValue="0"
                                            onChange={(e) => setMaterial2Grams(toNum(e.target.value))}
                                            onBlur={(e) => coerceBlankNumberToZero(e, setMaterial2Grams)}
                                            className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

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
                                    className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                                    onChange={(e) => setDesignLaborHours(toNum(e.target.value))}
                                    onBlur={(e) => coerceBlankNumberToZero(e, setDesignLaborHours)}
                                    className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                                    onChange={(e) => setTestLaborHours(toNum(e.target.value))}
                                    onBlur={(e) => coerceBlankNumberToZero(e, setTestLaborHours)}
                                    className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </label>
                        )}
                    </div>
                )}

                {anySvcSelected && (
                    <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                        <div className="mb-2 text-sm font-medium text-neutral-200">Preview</div>

                        {/* Only show Contract Printing-specific preview blocks if Contract Printing is selected */}
                        {svc.contract_printing ? (
                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                                    <div className="text-sm text-neutral-300">Material 1</div>
                                    <div className="mt-1 text-lg font-semibold text-white">
                                        {preview.lbs1.toFixed(2)} lb @ {money(preview.rate1)}/lb
                                    </div>
                                </div>

                                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                                    <div className="text-sm text-neutral-300">Material 2</div>
                                    <div className="mt-1 text-lg font-semibold text-white">
                                        {preview.lbs2.toFixed(2)} lb @ {money(preview.rate2)}/lb
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                            {svc.contract_printing ? (
                                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                                    <div className="text-sm text-neutral-300">Manufacturing cost</div>
                                    <div className="mt-1 text-lg font-semibold text-white">
                                        {money(preview.T2_manufacturingCost)}
                                    </div>
                                </div>
                            ) : null}

                            {svc.scanning ? (
                                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                                    <div className="text-sm text-neutral-300">3D Scanning</div>
                                    <div className="mt-1 text-lg font-semibold text-white">{money(preview.scanningTotal)}</div>
                                    <div className="text-xs text-neutral-500">
                                        {scanLaborHours.toFixed(2)} hrs @ {money(preview.scanningBillableRate)}/hr
                                    </div>
                                </div>
                            ) : null}

                            {svc.design ? (
                                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                                    <div className="text-sm text-neutral-300">3D Design</div>
                                    <div className="mt-1 text-lg font-semibold text-white">{money(preview.designTotal)}</div>
                                    <div className="text-xs text-neutral-500">
                                        {designLaborHours.toFixed(2)} hrs @ {money(preview.designBillableRate)}/hr
                                    </div>
                                </div>
                            ) : null}

                            {svc.testing ? (
                                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                                    <div className="text-sm text-neutral-300">Material Testing</div>
                                    <div className="mt-1 text-lg font-semibold text-white">{money(preview.testingTotal)}</div>
                                    <div className="text-xs text-neutral-500">
                                        {testLaborHours.toFixed(2)} hrs @ {money(preview.testingBillableRate)}/hr
                                    </div>
                                </div>
                            ) : null}

                            {svc.contract_printing ? (
                                <>
                                    <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                                        <div className="text-sm text-neutral-300">Labor fees</div>
                                        <div className="mt-1 text-lg font-semibold text-white">
                                            {money(preview.W2_laborFees_billable)}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                                        <div className="text-sm text-neutral-300">With failure rate</div>
                                        <div className="mt-1 text-lg font-semibold text-white">
                                            {money(preview.U2_withFailRate)}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                                        <div className="text-sm text-neutral-300">Total internal cost</div>

                                        {/* Line items (only show selected services) */}
                                        <div className="mt-2 space-y-2 text-sm">
                                            {svc.contract_printing ? (
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="text-neutral-200">Contract Printing</div>
                                                    <div className="font-semibold text-white">
                                                        {money(preview.contractPrintingInternalCost)}
                                                    </div>
                                                </div>
                                            ) : null}

                                            {svc.scanning ? (
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="text-neutral-200">
                                                        3D Scanning
                                                        <div className="text-xs text-neutral-500">
                                                            {scanLaborHours.toFixed(2)} hrs @ {money(preview.scanningInternalRate)}/hr
                                                        </div>
                                                    </div>
                                                    <div className="font-semibold text-white">
                                                        {money(preview.scanningInternalTotal)}
                                                    </div>
                                                </div>
                                            ) : null}

                                            {svc.design ? (
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="text-neutral-200">
                                                        3D Design
                                                        <div className="text-xs text-neutral-500">
                                                            {designLaborHours.toFixed(2)} hrs @ {money(preview.designInternalRate)}/hr
                                                        </div>
                                                    </div>
                                                    <div className="font-semibold text-white">
                                                        {money(preview.designInternalTotal)}
                                                    </div>
                                                </div>
                                            ) : null}

                                            {svc.testing ? (
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="text-neutral-200">
                                                        Material Testing
                                                        <div className="text-xs text-neutral-500">
                                                            {testLaborHours.toFixed(2)} hrs @ {money(preview.testingInternalRate)}/hr
                                                        </div>
                                                    </div>
                                                    <div className="font-semibold text-white">
                                                        {money(preview.testingInternalTotal)}
                                                    </div>
                                                </div>
                                            ) : null}
                                        </div>

                                        {/* Total */}
                                        <div className="mt-3 border-t border-neutral-800 pt-2">
                                            <div className="flex items-center justify-between">
                                                <div className="text-sm text-neutral-300">Total</div>
                                                <div className="text-lg font-semibold text-white">
                                                    {money(preview.internalCostAll)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                                        <div className="text-sm text-neutral-300">Profit</div>
                                        <div className="mt-1 text-lg font-semibold text-white">
                                            {money(preview.profit)}
                                        </div>
                                    </div>
                                </>
                            ) : null}

                            <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                                <div className="text-sm text-neutral-300">Total price (no discount)</div>
                                <div className="mt-1 text-lg font-semibold text-white">
                                    {money(preview.X_totalNoDiscount_all)}
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

            {addMatOpen && (
                <div className="fixed inset-0 z-50">
                    <div className="absolute inset-0 bg-black/70" onClick={() => setAddMatOpen(false)} />

                    <div className="absolute inset-0 flex items-center justify-center p-4">
                        <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 shadow-xl">
                            <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
                                <div className="text-sm font-semibold text-neutral-100">Add Material</div>
                                <button
                                    type="button"
                                    onClick={() => setAddMatOpen(false)}
                                    className="rounded-md px-2 py-1 text-sm text-neutral-300 hover:bg-neutral-900 hover:text-white"
                                >
                                    ✕
                                </button>
                            </div>

                            <form
                                className="grid gap-3 p-4"
                                onSubmit={async (e) => {
                                    e.preventDefault();
                                    setAddMatError(null);
                                    setAddMatSaving(true);

                                    try {
                                        const fd = new FormData(e.currentTarget);
                                        const result = await createMaterialReturningRow(fd);

                                        if (!result.ok || !result.material) {
                                            setAddMatError(result.error ?? "Failed to add material");
                                            return;
                                        }

                                        const newMat = result.material;

                                        setMaterialsState((prev) =>
                                            sortMaterials([
                                                ...prev,
                                                {
                                                    id: newMat.id,
                                                    name: newMat.name,
                                                    category: newMat.category,
                                                    is_active: newMat.is_active,
                                                    price_per_lb: Number(newMat.price_per_lb),
                                                },
                                            ])
                                        );

                                        if (addMatTarget === "material1") setMaterial1Id(newMat.id);
                                        else setMaterial2Id(newMat.id);

                                        setAddMatOpen(false);
                                        router.refresh();
                                    } catch (err: any) {
                                        setAddMatError(err?.message ?? "Failed to add material");
                                    } finally {
                                        setAddMatSaving(false);
                                    }
                                }}
                            >
                                <label className="grid gap-1">
                                    <span className="text-xs text-neutral-400">Name</span>
                                    <input
                                        name="name"
                                        required
                                        className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g., ASA Black"
                                    />
                                </label>

                                <label className="grid gap-1">
                                    <span className="text-xs text-neutral-400">Color</span>
                                    <input
                                        name="category"
                                        className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g., Black / White / Clear"
                                    />
                                </label>

                                <label className="grid gap-1">
                                    <span className="text-xs text-neutral-400">Price per lb</span>
                                    <input
                                        name="price_per_lb"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        required
                                        className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g., 18.50"
                                    />
                                </label>

                                <label className="flex items-center gap-2">
                                    <input
                                        name="is_active"
                                        type="checkbox"
                                        defaultChecked
                                        className="h-4 w-4 rounded border-neutral-700 bg-neutral-950"
                                    />
                                    <span className="text-sm text-neutral-200">Active</span>
                                </label>

                                {addMatError ? (
                                    <div className="rounded-md border border-red-900/40 bg-red-950/20 p-3 text-sm text-red-200">
                                        {addMatError}
                                    </div>
                                ) : null}

                                <div className="flex items-center justify-end gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setAddMatOpen(false)}
                                        className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-4 text-sm text-neutral-200 hover:bg-neutral-900"
                                        disabled={addMatSaving}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="h-10 rounded-md bg-white px-4 text-sm font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-60"
                                        disabled={addMatSaving}
                                    >
                                        {addMatSaving ? "Saving…" : "Add"}
                                    </button>
                                </div>

                                <p className="text-xs text-neutral-500">
                                    Tip: Press <span className="font-mono">Esc</span> to close.
                                </p>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
