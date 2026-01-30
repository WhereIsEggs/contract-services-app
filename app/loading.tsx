export default function Loading() {
  return (
    <main className="p-6 max-w-[900px] mx-auto">
      <div className="bg-neutral-900 rounded-lg shadow-lg p-6">
        <h1 className="text-3xl font-bold">Contract Services Tracking</h1>
        <hr className="my-8 border-neutral-800" />
        <ul className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950">
          <li className="p-4 transition-colors hover:bg-neutral-900/60">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-2 min-w-0">
                <div className="h-4 w-40 rounded bg-neutral-800 animate-pulse" />
                <div className="h-3 w-64 rounded bg-neutral-800 animate-pulse" />
                <div className="h-3 w-32 rounded bg-neutral-800 animate-pulse" />
              </div>
              <div className="h-5 w-10 rounded-full bg-neutral-800 animate-pulse" />
            </div>
          </li>
        </ul>
      </div>
    </main>
  );
}
