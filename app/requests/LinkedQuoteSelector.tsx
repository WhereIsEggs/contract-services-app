"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";


type QuoteOption = {
    id: string;
    customer_name: string;
    job_name: string;
    created_at: string;
};

export default function LinkedQuoteSelector({
    requestId,
    currentQuoteId,
    quotes, // keep for now so we don't break the parent prop shape
    action, // keep for now so we don't break the parent prop shape
}: {
    requestId: string;
    currentQuoteId: string | null;
    quotes: QuoteOption[];
    action: (formData: FormData) => void;
}) {

    const router = useRouter();

    // If already linked, show status + view link
    if (currentQuoteId) {
        return (
            <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-emerald-400">✓ Linked</span>
                <Link
                    href={`/quotes/${currentQuoteId}`}
                    className="text-xs text-neutral-300 underline hover:text-white"
                >
                    View quote
                </Link>
            </div>
        );
    }

    // Otherwise, show create button
    return (
        <button
            type="button"
            onClick={() => {
                router.push(`/quotes/new?fromRequest=${encodeURIComponent(requestId)}`);
            }}
            className="inline-flex h-10 items-center justify-center rounded-md bg-white px-4 text-sm font-medium text-neutral-900 hover:bg-neutral-200"
        >
            Create New Quote
        </button>
    );
}
