import Link from "next/link";
import { createClient } from "@/app/lib/supabase/server";
import { notFound } from "next/navigation";



export default async function RequestDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {

    const { id } = await params;
    if (!id) {
        notFound();
    }

    const supabase = await createClient();


    const { data: request, error } = await supabase
        .from("requests")
        .select("id, customer_name, created_at, services_requested, overall_status, project_details")
        .eq("id", id)
        .single();
    if (error || !request) {
        notFound();
    }

    return (



        <main className="p-6 max-w-[900px] mx-auto">
            <div className="bg-neutral-900 rounded-lg shadow-lg p-6">
                <Link
                    href="/"
                    className="text-sm text-blue-400 hover:text-blue-300 underline"
                >
                    ← Back to Requests
                </Link>

                <h1 className="mt-4 text-2xl font-bold">Request Details</h1>

                {request && (
                    <div className="mt-6 grid gap-4 text-sm text-neutral-200">
                        <div>
                            <span className="text-neutral-400">Customer</span>
                            <div className="font-medium">
                                {request.customer_name || "Unnamed customer"}
                            </div>
                        </div>

                        <div>
                            <span className="text-neutral-400">Requested Services</span>
                            <div>
                                {(request.services_requested ?? []).join(", ") || "—"}
                            </div>
                        </div>

                        <div>
                            <span className="text-neutral-400">Status</span>
                            <div>{request.overall_status}</div>
                        </div>

                        <div>
                            <span className="text-neutral-400">Submitted</span>
                            <div>
                                {new Date(request.created_at).toLocaleString(undefined, {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                })}
                            </div>
                        </div>

                        <div>
                            <span className="text-neutral-400">Project Details</span>
                            <div className="whitespace-pre-wrap">
                                {request.project_details || "—"}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
