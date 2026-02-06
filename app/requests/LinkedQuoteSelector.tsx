"use client";

import { useState, useTransition } from "react";
import Link from "next/link";


type QuoteOption = {
    id: string;
    customer_name: string;
    job_name: string;
    created_at: string;
};

export default function LinkedQuoteSelector({
    requestId,
    currentQuoteId,
    quotes,
    action,
}: {
    requestId: string;
    currentQuoteId: string | null;
    quotes: QuoteOption[];
    action: (formData: FormData) => void;
}) {
    const [selected, setSelected] = useState(currentQuoteId ?? "");
    const [isPending, startTransition] = useTransition();

    const hasChanged = selected !== (currentQuoteId ?? "");

    return (
        <form
            action={(formData) => {
                startTransition(() => {
                    action(formData);
                });
            }}
            className="flex flex-wrap items-center gap-2"
        >
            <select
                disabled={Boolean(currentQuoteId)}
                name="quote_id"
                value={selected}
                onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__new_quote__") {
                        window.location.href = `/quotes/new?fromRequest=${encodeURIComponent(requestId)}`;
                        return;
                    }
                    setSelected(v);
                }}
                className={`h-10 min-w-[260px] rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 ${currentQuoteId ? "opacity-70 cursor-not-allowed" : ""
                    }`}
            >
                <option value="">— No quote linked —</option>

                {quotes.length === 0 ? (
                    <option value="__new_quote__">＋ Create a new quote…</option>
                ) : (
                    quotes.map((q) => (
                        <option key={q.id} value={q.id}>
                            {new Date(q.created_at).toLocaleDateString()} — {q.customer_name} — {q.job_name}
                        </option>
                    ))
                )}
            </select>

            {hasChanged && (
                <button
                    type="submit"
                    disabled={isPending}
                    className={`h-10 rounded-md px-4 text-sm font-medium transition
            ${isPending
                            ? "bg-neutral-700 text-neutral-300 cursor-not-allowed"
                            : "bg-white text-neutral-900 hover:bg-neutral-200"
                        }`}
                >
                    {isPending ? "Saving…" : "Save"}
                </button>
            )}

            {!hasChanged && selected && (
                <div className="flex items-center gap-3">
                    <span className="text-xs text-emerald-400">✓ Linked</span>
                    <Link
                        href={`/quotes/${selected}`}
                        className="text-xs text-neutral-300 underline hover:text-white"
                    >
                        View quote
                    </Link>
                </div>
            )}
        </form>
    );
}
