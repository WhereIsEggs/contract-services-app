"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "./lib/supabase/server";
import { redirect } from "next/navigation";


function readServices(formData: FormData) {
  const services: string[] = [];
  if (formData.get("svc_scan")) services.push("3D Scanning");
  if (formData.get("svc_design")) services.push("3D Design");
  if (formData.get("svc_print")) services.push("Contract Print");
  return services;
}

export type CreateRequestState = {
  ok: boolean;
  errors: string[];
  requestId?: string;
};

export async function createRequestAction(
  _prevState: CreateRequestState,
  formData: FormData
): Promise<CreateRequestState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const customer_name = String(formData.get("customer_name") ?? "").trim();
  const project_details = String(formData.get("project_details") ?? "").trim();
  const services_requested = readServices(formData);

  // Validate ALL at once
  const errors: string[] = [];
  if (!customer_name) errors.push("Customer Name is required.");
  if (!project_details) errors.push("Project Details are required.");
  if (services_requested.length === 0) errors.push("Select at least one service.");

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // 1) Create the parent request and get its id back
  const { data: newRequest, error: reqError } = await supabase
    .from("requests")
    .insert([
      {
        customer_name,
        project_details,
        services_requested,
        overall_status: "New",
        scan_status: "Not Started",
        design_status: "Not Started",
        print_status: "Not Started",
      },
    ])
    .select("id")
    .single();

  if (reqError || !newRequest) {
    return {
      ok: false,
      errors: [reqError?.message ?? "Failed to create request."],
    };
  }

  // 2) Create one service-step row per selected service
  const sortOrder: Record<string, number> = {
    "3D Scanning": 10,
    "3D Design": 20,
    "Contract Print": 30,
  };

  const serviceRows = services_requested.map((service_type) => ({
    request_id: newRequest.id,
    service_type,
    step_status: "Not Started",
    sort_order: sortOrder[service_type] ?? 0,
  }));

  const { error: svcError } = await supabase
    .from("request_services")
    .insert(serviceRows);

  if (svcError) {
    return {
      ok: false,
      errors: [svcError.message ?? "Failed to create request services."],
    };
  }

  revalidatePath("/requests");
  revalidatePath("/dashboard");

  return { ok: true, errors: [], requestId: newRequest.id };
}


export async function createRequest(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const customer_name = String(formData.get("customer_name") ?? "").trim();
  const project_details = String(formData.get("project_details") ?? "").trim();
  const services_requested = readServices(formData);

  // Client-side required prevents most cases, but server must still validate.
  // Redirect back with a friendly message instead of throwing.
  if (!customer_name) redirect(`/requests/new?err=${encodeURIComponent("Customer Name is required.")}`);
  if (!project_details) redirect(`/requests/new?err=${encodeURIComponent("Project Details are required.")}`);
  if (services_requested.length === 0) redirect(`/requests/new?err=${encodeURIComponent("Select at least one service.")}`);

  // 1) Create the parent request and get its id back
  const { data: newRequest, error: reqError } = await supabase
    .from("requests")
    .insert([
      {
        customer_name,
        project_details,
        services_requested,
        overall_status: "New",
        // legacy per-service columns stay in schema for now, but are not the source of truth
        scan_status: "Not Started",
        design_status: "Not Started",
        print_status: "Not Started",
      },
    ])
    .select("id")
    .single();

  if (reqError || !newRequest) {
    redirect(`/requests/new?err=${encodeURIComponent(reqError?.message ?? "Failed to create request.")}`);
  }

  // 2) Create one service-step row per selected service
  const sortOrder: Record<string, number> = {
    "3D Scanning": 10,
    "3D Design": 20,
    "Contract Print": 30,
  };

  const serviceRows = services_requested.map((service_type) => ({
    request_id: newRequest.id,
    service_type,
    step_status: "Not Started",
    sort_order: sortOrder[service_type] ?? 0,
  }));

  const { error: svcError } = await supabase
    .from("request_services")
    .insert(serviceRows);

  if (svcError) {
    redirect(`/requests/new?err=${encodeURIComponent(svcError.message ?? "Failed to create request services.")}`);
  }
  revalidatePath("/requests");
  revalidatePath("/dashboard");
}

// ✅ THIS must exist and close createRequest


// ✅ now a new export can safely start
export async function updateServiceStepStatus(
  serviceId: string,
  step_status: string,
  notes?: string
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const allowed = new Set(["Not Started", "In Progress", "Completed"]);
  if (!allowed.has(step_status)) throw new Error("Invalid step status");

  // 0) Get the parent request_id FIRST (reliable)
  const { data: svcRow, error: svcRowError } = await supabase
    .from("request_services")
    .select("request_id, service_type")
    .eq("id", serviceId)
    .single();

  if (svcRowError || !svcRow?.request_id) throw new Error(JSON.stringify(svcRowError));

  // 1) Normalize: if bad data exists (multiple steps In Progress), keep one and set the rest to Waiting
  {
    const { data: activeSteps, error: activeStepsError } = await supabase
      .from("request_services")
      .select("id, started_at, sort_order")
      .eq("request_id", svcRow.request_id)
      .eq("step_status", "In Progress")
      // keep the earliest started; if no timestamps, fall back to sort_order
      .order("started_at", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true });

    if (activeStepsError) throw new Error(JSON.stringify(activeStepsError));

    if ((activeSteps ?? []).length > 1) {
      const keepId = activeSteps![0].id;
      const otherIds = activeSteps!.slice(1).map((s) => s.id);

      const { error: normalizeError } = await supabase
        .from("request_services")
        .update({ step_status: "Waiting" })
        .in("id", otherIds);

      if (normalizeError) throw new Error(JSON.stringify(normalizeError));
    }
  }


  // 1) Guard: only ONE step can be In Progress at a time for a given request
  if (step_status === "In Progress") {
    const { data: existingActive, error: activeError } = await supabase
      .from("request_services")
      .select("id")
      .eq("request_id", svcRow.request_id)
      .eq("step_status", "In Progress")
      .neq("id", serviceId)
      .limit(1);

    if (activeError) throw new Error(JSON.stringify(activeError));

    if ((existingActive ?? []).length > 0) {
      throw new Error("Another service step is already in progress for this request.");
    }
  }



  // 2) Update the selected service step
  const updatePayload: any = { step_status };

  const { data: existingNotesRow } = await supabase
    .from("request_services")
    .select("notes")
    .eq("id", serviceId)
    .single();

  updatePayload.notes = existingNotesRow?.notes ?? "";


  if (typeof notes === "string" && notes.trim().length > 0) {
    const timestamp = new Date().toLocaleString();
    const entry = `[${timestamp}] ${notes.trim()}`;

    updatePayload.notes = updatePayload.notes
      ? `${updatePayload.notes}\n\n${entry}`
      : entry;
  }

  if (step_status === "In Progress") {
    updatePayload.started_at = new Date().toISOString();
    updatePayload.completed_at = null;
  }

  if (step_status === "Completed") {
    updatePayload.completed_at = new Date().toISOString();
  }

  const { error: stepError } = await supabase
    .from("request_services")
    .update(updatePayload)
    .eq("id", serviceId);

  if (stepError) throw new Error(JSON.stringify(stepError));

  // 3) If moved to In Progress, set overall_status to reflect the active service
  if (step_status === "In Progress") {
    const { error: reqError } = await supabase
      .from("requests")
      .update({ overall_status: "In Progress" })
      .eq("id", svcRow.request_id);

    if (reqError) throw new Error(JSON.stringify(reqError));
  }

  // 3b) If this step was set to Completed, and ALL steps for the request are Completed,
  // then set the parent request to Completed.
  if (step_status === "Completed") {
    const { data: allSteps, error: stepsError } = await supabase
      .from("request_services")
      .select("step_status")
      .eq("request_id", svcRow.request_id);

    if (stepsError) throw new Error(JSON.stringify(stepsError));

    const allCompleted =
      (allSteps ?? []).length > 0 &&
      (allSteps ?? []).every((s: any) => s.step_status === "Completed");

    if (allCompleted) {
      const { error: reqDoneError } = await supabase
        .from("requests")
        .update({ overall_status: "Completed" })
        .eq("id", svcRow.request_id);

      if (reqDoneError) throw new Error(JSON.stringify(reqDoneError));
    }
  }


  // 4) Refresh pages that display request/service data
  revalidatePath("/requests");
  revalidatePath("/dashboard");
  revalidatePath(`/requests/${svcRow.request_id}`);
}


