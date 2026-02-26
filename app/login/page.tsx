export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; reset?: string }>;
}) {
  const sp = await searchParams;
  const hasError = sp?.error === "1";
  const resetDone = sp?.reset === "1";

  return (
    <div className="min-h-dvh bg-neutral-950 text-neutral-100 grid place-items-center px-4">
      <div className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 shadow-lg">
        <h1 className="text-2xl font-semibold">Login</h1>
        <p className="mt-1 text-sm text-neutral-400">Sign in to continue</p>

        {hasError ? (
          <p className="mt-4 rounded-md border border-red-900/40 bg-red-950/20 px-3 py-2 text-sm text-red-300">
            Invalid email or password.
          </p>
        ) : null}

        {resetDone ? (
          <p className="mt-4 rounded-md border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-300">
            Password updated. You can sign in now.
          </p>
        ) : null}

        <form method="POST" action="/auth/login" className="mt-6 grid gap-4">
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

          <label className="grid gap-1.5 text-sm text-neutral-200">
            <span>Password</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="h-10 w-full rounded-md border border-neutral-700 bg-neutral-950/60 px-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <button
            type="submit"
            className="mt-1 inline-flex h-10 items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 px-4 text-sm font-medium text-neutral-100 hover:bg-neutral-700"
          >
            Sign in
          </button>

          <a
            href="/forgot-password"
            className="text-sm text-neutral-300 hover:text-white underline underline-offset-2"
          >
            Forgot password?
          </a>
        </form>
      </div>
    </div>
  );
}
