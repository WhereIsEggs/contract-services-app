import { createClient } from "./lib/supabase/server";
import { createRequest } from "./actions";
import Link from "next/link";
import { redirect } from "next/navigation";

type RequestRow = {
  id: string;
  created_at: string;
  customer_name: string | null;
  services_requested: string[] | null;
  overall_status: string;
};


export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }


  const { data, error } = await supabase
    .from("requests")
    .select("id, created_at, customer_name, services_requested, overall_status")
    .order("created_at", { ascending: false })
    .limit(10)
    .returns<RequestRow[]>();

  return (
    <main className="p-6 max-w-[900px] mx-auto">
      <div className="bg-neutral-900 rounded-lg shadow-lg p-6">
        <h1 className="text-3xl font-bold">Contract Services Tracking</h1>

        {user && (
          <form method="POST" action="/auth/logout" className="mt-4 mb-6">
            <button
              type="submit"
              className="text-sm text-neutral-300 hover:text-white underline"
            >
              Log out
            </button>
          </form>
        )}

        <hr className="my-8 border-neutral-800" />


        <form
          action={async (formData) => {
            "use server";
            await createRequest(formData);
          }}
          className="mt-4 grid gap-4 rounded-lg border border-neutral-700 p-4"
        >
          <div className="grid gap-1">
            <label className="text-sm font-medium text-neutral-200">
              Customer Name
            </label>
            <input
              name="customer_name"
              placeholder="Acme Corp"
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <fieldset className="rounded-lg border border-neutral-700 p-4">
            <legend className="px-1 text-sm font-medium text-neutral-200">
              Services Requested
            </legend>

            <div className="mt-3 grid gap-3">
              <label className="flex items-center gap-2 text-sm text-neutral-200">
                <input
                  type="checkbox"
                  name="svc_scan"
                  className="h-4 w-4 rounded border-neutral-600 bg-neutral-950"
                />
                3D Scanning
              </label>

              <label className="flex items-center gap-2 text-sm text-neutral-200">
                <input
                  type="checkbox"
                  name="svc_design"
                  className="h-4 w-4 rounded border-neutral-600 bg-neutral-950"
                />
                3D Design
              </label>

              <label className="flex items-center gap-2 text-sm text-neutral-200">
                <input
                  type="checkbox"
                  name="svc_print"
                  className="h-4 w-4 rounded border-neutral-600 bg-neutral-950"
                />
                Contract Print
              </label>
            </div>
          </fieldset>


          <div className="grid gap-1">
            <label className="text-sm font-medium text-neutral-200">
              Project Details
            </label>
            <textarea
              name="project_details"
              placeholder="Customer needs a part scanned, cleaned up in CAD, then printed..."
              rows={5}
              className="w-full resize-none rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>


          <button
            type="submit"
            className="mt-2 inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-900"
          >
            Submit Request
          </button>
        </form>

        <hr className="my-8 border-neutral-800" />

        <h2 className="mt-6 mb-3 text-lg font-semibold text-neutral-200">
          Latest Requests
        </h2>


        {error && (
          <p className="text-sm text-red-400">
            Error loading requests.
          </p>
        )}

        {data && data.length === 0 && (
          <ul className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950">
            <li className="p-6 text-sm text-neutral-400 text-center">
              No requests yet.
            </li>
          </ul>
        )}

        {data && data.length > 0 && (
          <ul className="mt-4 divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-950">
            {data.map((req: RequestRow) => (
              <li
                key={req.id}
                className="group relative p-4 transition-colors hover:bg-neutral-800/50 active:bg-neutral-800 focus-within:outline focus-within:outline-2 focus-within:outline-blue-500 rounded-lg focus-within:z-10 focus-within:bg-neutral-900/60"
              >
                <Link
                  href={`/requests/${req.id}`}
                  className="block w-full text-left cursor-pointer focus:outline-none"
                >


                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p
                        className="font-medium text-neutral-100 truncate"
                        title={req.customer_name || "Unnamed customer"}
                      >
                        {req.customer_name || "Unnamed customer"}
                      </p>


                      <p
                        className="text-sm text-neutral-400 truncate"
                        title={(req.services_requested ?? []).join(", ") || "—"}
                      >
                        {(req.services_requested ?? []).join(", ") || "—"}
                      </p>

                      <p className="mt-1 text-xs text-neutral-500">
                        {new Date(req.created_at).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>


                    </div>


                    <div className="flex items-center gap-3">
                      <span
                        title={`Status: ${req.overall_status}`}
                        className={
                          "inline-flex shrink-0 items-center justify-center text-xs leading-none rounded-full px-2 py-1 border " +
                          (req.overall_status === "New"
                            ? "bg-blue-600/20 text-blue-200 border-blue-600/30"
                            : "bg-neutral-800 text-neutral-300 border-neutral-700")
                        }
                      >
                        {req.overall_status}
                      </span>

                      <span className="text-neutral-600 text-sm opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5 group-focus-within:opacity-100 group-focus-within:translate-x-0.5">
                        ›
                      </span>
                    </div>

                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

      </div>
    </main >
  );
}
