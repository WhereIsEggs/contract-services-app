"use client";

type ConfirmSubmitButtonProps = {
    label: string;
    confirmMessage: string;
    className?: string;
};

export default function ConfirmSubmitButton({
    label,
    confirmMessage,
    className,
}: ConfirmSubmitButtonProps) {
    return (
        <button
            type="button"
            className={className}
            onClick={(e) => {
                const form = e.currentTarget.closest("form");
                if (!form) return;

                if (!form.reportValidity()) return;

                if (!window.confirm(confirmMessage)) return;

                form.requestSubmit();
            }}
        >
            {label}
        </button>
    );
}
