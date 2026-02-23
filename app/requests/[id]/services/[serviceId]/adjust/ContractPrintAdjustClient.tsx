"use client";

import { useMemo, useState } from "react";

type MaterialOption = {
    id: string;
    name: string;
    category: string | null;
    is_active: boolean;
    price_per_lb: number;
};

export default function ContractPrintAdjustClient(props: {
    materials: MaterialOption[];

    // Baseline IDs (quoted)
    qb_material1_id: string | null;
    qb_material2_id: string | null;

    // Existing/saved values (extra usage)
    initialRestarted: boolean;

    initialExtraMachineHours: string; // already formatted string is fine
    initialExtraSetupHours: string;
    initialExtraSupportRemovalHours: string;

    initialExtraMaterial1Id: string;
    initialExtraMaterial2Id: string;
    initialExtraMaterial1Grams: string;
    initialExtraMaterial2Grams: string;

    initialNotes: string;
}) {
    const baseline1 = (props.qb_material1_id ?? "").trim();
    const baseline2 = (props.qb_material2_id ?? "").trim();

    const [restarted, setRestarted] = useState<boolean>(props.initialRestarted);

    const [mat1Id, setMat1Id] = useState<string>(props.initialExtraMaterial1Id ?? "");
    const [mat2Id, setMat2Id] = useState<string>(props.initialExtraMaterial2Id ?? "");
    const [mat1g, setMat1g] = useState<string>(props.initialExtraMaterial1Grams ?? "0");
    const [mat2g, setMat2g] = useState<string>(props.initialExtraMaterial2Grams ?? "0");

    // Track whether the user manually edited a row
    const [touched1, setTouched1] = useState(false);
    const [touched2, setTouched2] = useState(false);

    const matOptions = useMemo(() => props.materials ?? [], [props.materials]);

    function toggleRestarted(next: boolean) {
        setRestarted(next);

        if (next) {
            // Turning ON: only auto-fill IDs if blank (don’t override user-entered values)
            if (!mat1Id && baseline1) setMat1Id(baseline1);
            if (!mat2Id && baseline2) setMat2Id(baseline2);
            return;
        }

        // Turning OFF: if the row was auto-filled (baseline) and user hasn't touched it and grams are 0 -> clear it
        const g1 = Number(mat1g);
        const g2 = Number(mat2g);

        if (!touched1 && mat1Id === baseline1 && (!Number.isFinite(g1) || g1 <= 0)) setMat1Id("");
        if (!touched2 && mat2Id === baseline2 && (!Number.isFinite(g2) || g2 <= 0)) setMat2Id("");
    }

    return (
        <div className="grid gap-4">
            <label className="inline-flex items-center gap-2 text-sm">
                <input
                    type="checkbox"
                    name="restarted"
                    checked={restarted}
                    onChange={(e) => toggleRestarted(e.target.checked)}
                />
                Was it restarted?
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                    <label className="text-sm">Extra machine time (hours)</label>
                    <input
                        name="extra_machine_hours"
                        defaultValue={props.initialExtraMachineHours}
                        inputMode="decimal"
                        className="h-10 w-full rounded-md border border-neutral-800 bg-neutral-950/40 px-3 text-sm text-neutral-100"
                    />
                </div>

                <div className="grid gap-2">
                    <label className="text-sm">Extra setup time (hours)</label>
                    <input
                        name="extra_setup_hours"
                        defaultValue={props.initialExtraSetupHours}
                        inputMode="decimal"
                        className="h-10 w-full rounded-md border border-neutral-800 bg-neutral-950/40 px-3 text-sm text-neutral-100"
                    />
                </div>

                <div className="grid gap-2">
                    <label className="text-sm">Extra support removal (hours)</label>
                    <input
                        name="extra_support_removal_hours"
                        defaultValue={props.initialExtraSupportRemovalHours}
                        inputMode="decimal"
                        className="h-10 w-full rounded-md border border-neutral-800 bg-neutral-950/40 px-3 text-sm text-neutral-100"
                    />
                </div>
            </div>

            {/* Extra materials (2 rows for now) */}
            <div className="mt-2">
                <div className="text-sm font-medium text-neutral-100">Extra material usage</div>

                <div className="mt-2 grid gap-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px]">
                        <select
                            name="extra_material1_id"
                            value={mat1Id}
                            onChange={(e) => {
                                setTouched1(true);
                                setMat1Id(e.target.value);
                            }}
                            className="h-10 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 text-sm text-neutral-100"
                        >
                            <option value="">Select material…</option>
                            {matOptions.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.category ? `${m.category} — ` : ""}
                                    {m.name}
                                    {!m.is_active ? " (inactive)" : ""}
                                </option>
                            ))}
                        </select>

                        <input
                            name="extra_material1_grams"
                            value={mat1g}
                            onChange={(e) => {
                                setTouched1(true);
                                setMat1g(e.target.value);
                            }}
                            inputMode="numeric"
                            className="h-10 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 text-sm text-neutral-100"
                            placeholder="extra grams"
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px]">
                        <select
                            name="extra_material2_id"
                            value={mat2Id}
                            onChange={(e) => {
                                setTouched2(true);
                                setMat2Id(e.target.value);
                            }}
                            className="h-10 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 text-sm text-neutral-100"
                        >
                            <option value="">Select material…</option>
                            {matOptions.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.category ? `${m.category} — ` : ""}
                                    {m.name}
                                    {!m.is_active ? " (inactive)" : ""}
                                </option>
                            ))}
                        </select>

                        <input
                            name="extra_material2_grams"
                            value={mat2g}
                            onChange={(e) => {
                                setTouched2(true);
                                setMat2g(e.target.value);
                            }}
                            inputMode="numeric"
                            className="h-10 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 text-sm text-neutral-100"
                            placeholder="extra grams"
                        />
                    </div>

                    <div className="text-xs text-neutral-500">
                        Enter only additional material used beyond the quoted baseline.
                    </div>

                    <div className="text-xs text-neutral-500">
                        (We’ll make this truly dynamic/add-row later. Two rows is enough to start.)
                    </div>
                </div>
            </div>

            <div className="grid gap-2">
                <label className="text-sm">Failure / restart notes</label>
                <textarea
                    name="cp_notes"
                    rows={4}
                    defaultValue={props.initialNotes}
                    className="w-full rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-sm text-neutral-100"
                    placeholder="Describe restarts, failures, extra runs, etc."
                />
            </div>
        </div>
    );
}