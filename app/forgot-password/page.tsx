import Link from "next/link";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<{ sent?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const sent = sp?.sent === "1";
  const hasError = sp?.error === "1";

  return (
    <div className="min-h-dvh bg-neutral-950 text-neutral-100 grid place-items-center px-4">
      <div className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 shadow-lg">
        <h1 className="text-2xl font-semibold">Reset password</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Enter your email and we’ll send you a reset link.
        </p>

        {sent ? (
          <p className="mt-4 rounded-md border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-300">
            If an account exists for that email, a reset link has been sent.
          </p>
        ) : null}

        {hasError ? (
          <p className="mt-4 rounded-md border border-red-900/40 bg-red-950/20 px-3 py-2 text-sm text-red-300">
            Could not send reset email. Please try again.
          </p>
        ) : null}

        <form method="POST" action="/auth/forgot-password" className="mt-6 grid gap-4">
          <label className="grid gap-1.5 text-sm text-neutral-200">
            <span>Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="h-10 w-full rounded-md border border-neutral-700 bg-neutral-950/60 px-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 px-4 text-sm font-medium text-neutral-100 hover:bg-neutral-700"
          >
            Send reset link
          </button>
        </form>

        <div className="mt-4">
          <Link href="/login" className="text-sm text-neutral-300 hover:text-white underline underline-offset-2">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
