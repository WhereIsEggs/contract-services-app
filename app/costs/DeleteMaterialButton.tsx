"use client";

export default function DeleteMaterialButton({
    id,
    name,
    action,
}: {
    id: string;
    name: string;
    action: (formData: FormData) => void;
}) {
    return (
        <form
            action={action}
            onSubmit={(e) => {
                if (!confirm(`Delete material "${name}"? This cannot be undone.`)) {
                    e.preventDefault();
                }
            }}
            className="justify-end"
        >
            <input type="hidden" name="id" value={id} />
            <button
                type="submit"
                className="h-9 w-24 rounded-md border border-red-900/40 bg-red-950/20 px-3 text-xs text-red-200 hover:bg-red-950/40"
            >
                Delete
            </button>
        </form>
    );
}
