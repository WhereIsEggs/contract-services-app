"use client";

import { useEffect, useState } from "react";

type MaterialRow = {
    id: string;
    name: string;
    category: string | null;
    price_per_lb: number;
    is_active: boolean;
};

export default function EditMaterialModal({
    material,
    action,
}: {
    material: MaterialRow;
    action: (formData: FormData) => void;
}) {
    const [open, setOpen] = useState(false);

    // Close modal on Escape
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") setOpen(false);
        }
        if (open) window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open]);

    return (
        <>
            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="h-9 w-24 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-xs text-neutral-200 hover:bg-neutral-900"
                >
                    Edit
                </button>
            </div>

            {open && (
                <div className="fixed inset-0 z-50">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/70"
                        onClick={() => setOpen(false)}
                    />

                    {/* Modal */}
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                        <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 shadow-xl">
                            <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
                                <div className="text-sm font-semibold text-neutral-100">
                                    Edit Material
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setOpen(false)}
                                    className="rounded-md px-2 py-1 text-sm text-neutral-300 hover:bg-neutral-900 hover:text-white"
                                >
                                    ✕
                                </button>
                            </div>

                            <form action={action} className="grid gap-3 p-4">
                                <input type="hidden" name="id" value={material.id} />

                                <label className="grid gap-1">
                                    <span className="text-xs text-neutral-400">Name</span>
                                    <input
                                        name="name"
                                        defaultValue={material.name}
                                        required
                                        className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
                                    />
                                </label>

                                <label className="grid gap-1">
                                    <span className="text-xs text-neutral-400">Category</span>
                                    <input
                                        name="category"
                                        defaultValue={material.category ?? ""}
                                        className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
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
                                        defaultValue={String(material.price_per_lb)}
                                        className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
                                    />
                                </label>

                                <label className="flex items-center gap-2">
                                    <input
                                        name="is_active"
                                        type="checkbox"
                                        defaultChecked={material.is_active}
                                        className="h-4 w-4 rounded border-neutral-700 bg-neutral-950"
                                    />
                                    <span className="text-sm text-neutral-200">Active</span>
                                </label>

                                <div className="flex items-center justify-end gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setOpen(false)}
                                        className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-4 text-sm text-neutral-200 hover:bg-neutral-900"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="h-10 rounded-md bg-white px-4 text-sm font-medium text-neutral-900 hover:bg-neutral-200"
                                    >
                                        Save
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
        </>
    );
}
