"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "./lib/supabase/server";

function readServices(formData: FormData) {
  const services: string[] = [];
  if (formData.get("svc_scan")) services.push("3D Scanning");
  if (formData.get("svc_design")) services.push("3D Design");
  if (formData.get("svc_print")) services.push("Contract Print");
  return services;
}

export async function createRequest(formData: FormData) {
  const supabase = await createClient();
  const {
      data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

    const customer_name = String(formData.get("customer_name") ?? "").trim();
    const project_details = String(formData.get("project_details") ?? "").trim();
    const services_requested = readServices(formData);

    if (!customer_name) throw new Error("Customer Name is required.");
    if (services_requested.length === 0) throw new Error("Select at least one service.");
    if (!project_details) throw new Error("Project Details are required.");

    const { error } = await supabase.from("requests").insert([
    {
      customer_name,
      project_details,
      services_requested,
      // leave initial_poc blank for now; we’ll fill it from auth later
      overall_status: "New",
      scan_status: services_requested.includes("3D Scanning") ? "Not Started" : "Not Started",
      design_status: services_requested.includes("3D Design") ? "Not Started" : "Not Started",
      print_status: services_requested.includes("Contract Print") ? "Not Started" : "Not Started",
    },
  ]);

  if (error) throw new Error(JSON.stringify(error));

  revalidatePath("/");
}
