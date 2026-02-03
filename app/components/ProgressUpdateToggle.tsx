"use client";

import { useState } from "react";

export default function ProgressUpdateToggle({
    initialNotes,
    action,
}: {
    initialNotes: string | null;
    action: (formData: FormData) => void;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const hasNotes = Boolean(initialNotes && initialNotes.trim().length > 0);

    return (
        <div className="grid gap-2">
            {/* Read-only view (only when NOT editing) */}
            {!isEditing ? (
                hasNotes ? (
                    <div className="rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-sm text-neutral-200 whitespace-pre-wrap">
                        {initialNotes}
                    </div>
                ) : (
                    <div className="text-sm text-neutral-500">No progress update yet.</div>
                )
            ) : null}

            {/* Toggle button (only when NOT editing) */}
            {!isEditing ? (
                <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="inline-flex items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-100 hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-900 transition"
                >
                    {hasNotes ? "Edit Progress Update" : "Add Progress Update"}
                </button>
            ) : null}

            {/* Editor (ONLY when editing) */}
            {isEditing ? (
                <form action={action} className="grid gap-2">
                    <textarea
                        name="notes"
                        defaultValue={initialNotes ?? ""}
                        placeholder="Add a progress update for the team…"
                        className="w-full rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={3}
                    />

                    <div className="relative flex flex-nowrap items-stretch gap-2">
                        <button
                            type="submit"
                            className="relative z-10 inline-flex flex-1 min-w-0 items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-900 transition"
                        >
                            <span className="opacity-0">Save progress update</span>
                        </button>

                        {/* Overlay label centered to the FULL row width */}
                        <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center text-sm font-medium text-white">
                            Save progress update
                        </span>

                        <button
                            type="button"
                            onClick={() => setIsEditing(false)}
                            className="relative z-30 inline-flex shrink-0 w-28 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-100 hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-900 transition"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            ) : null}
        </div>
    );
}
