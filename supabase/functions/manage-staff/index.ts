import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STAFF_ROLES = ["manager", "kitchen_staff", "waiter_staff", "billing_staff"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization")!;

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
    if (authError || !caller) return json({ error: "Unauthorized" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("role, restaurant_id")
      .eq("user_id", caller.id)
      .single();

    if (!callerRole || !["super_admin", "restaurant_admin"].includes(callerRole.role)) {
      return json({ error: "Forbidden: Admin access required" }, 403);
    }

    const body = await req.json();
    const { action } = body;

    // Lazy expiry sweep on every call (defensive)
    await adminClient.rpc("expire_temporary_roles").catch(() => {});

    if (action === "create") {
      const { email, password, name, role } = body;

      if (!email || !password || !role) return json({ error: "Missing required fields" }, 400);
      if (role === "super_admin") return json({ error: "Cannot create super_admin roles" }, 403);
      if (role === "restaurant_admin" && callerRole.role !== "super_admin") {
        return json({ error: "Only platform admins can create admin roles" }, 403);
      }

      const restaurantId = (callerRole.role === "super_admin" && body.restaurant_id)
        ? body.restaurant_id
        : callerRole.restaurant_id;
      if (!restaurantId && callerRole.role !== "super_admin") {
        return json({ error: "No restaurant context" }, 400);
      }

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { name },
      });
      if (createError) return json({ error: createError.message }, 400);

      await adminClient.from("user_roles").insert({
        user_id: newUser.user.id, role, restaurant_id: restaurantId,
      });
      await adminClient.from("staff_profiles").insert({
        user_id: newUser.user.id, email, name: name || null,
        restaurant_id: restaurantId, is_active: true,
      });

      await adminClient.from("system_logs").insert({
        actor_id: caller.id, actor_email: caller.email,
        action: "staff.created", entity_type: "staff", entity_id: newUser.user.id,
        details: { email, name, role, restaurant_id: restaurantId },
      });

      return json({ success: true, user_id: newUser.user.id });
    }

    if (action === "delete") {
      const { user_id } = body;
      if (!user_id) return json({ error: "user_id required" }, 400);

      const { data: targetRole } = await adminClient
        .from("user_roles").select("role").eq("user_id", user_id).single();

      if (targetRole && ["super_admin", "restaurant_admin"].includes(targetRole.role)) {
        return json({ error: "Cannot delete admin users" }, 403);
      }

      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      await adminClient.from("staff_profiles").delete().eq("user_id", user_id);
      await adminClient.from("role_assignments")
        .update({ status: "cancelled", reverted_at: new Date().toISOString() })
        .eq("user_id", user_id).eq("status", "active");
      await adminClient.auth.admin.deleteUser(user_id);

      await adminClient.from("system_logs").insert({
        actor_id: caller.id, actor_email: caller.email,
        action: "staff.deleted", entity_type: "staff", entity_id: user_id,
        details: {},
      });

      return json({ success: true });
    }

    if (action === "assign_role") {
      const { user_id, role, assignment_type, duration_hours, notes } = body;

      if (!user_id || !role || !assignment_type) {
        return json({ error: "user_id, role, assignment_type required" }, 400);
      }
      if (!STAFF_ROLES.includes(role)) {
        return json({ error: "Invalid role" }, 400);
      }
      if (!["permanent", "temporary"].includes(assignment_type)) {
        return json({ error: "Invalid assignment_type" }, 400);
      }
      if (assignment_type === "temporary") {
        if (!Number.isFinite(duration_hours) || duration_hours < 1 || duration_hours > 720) {
          return json({ error: "duration_hours must be 1-720" }, 400);
        }
      }

      // Load target staff profile + current role
      const { data: profile } = await adminClient
        .from("staff_profiles")
        .select("restaurant_id, email, name")
        .eq("user_id", user_id).single();
      if (!profile) return json({ error: "Staff not found" }, 404);

      // Tenant scope check
      if (callerRole.role === "restaurant_admin" && profile.restaurant_id !== callerRole.restaurant_id) {
        return json({ error: "Forbidden" }, 403);
      }

      const { data: existingRole } = await adminClient
        .from("user_roles").select("role")
        .eq("user_id", user_id).eq("restaurant_id", profile.restaurant_id).single();
      const previousRole = existingRole?.role ?? null;

      // Cancel any currently active temp assignment (replaced by this new one)
      await adminClient.from("role_assignments")
        .update({ status: "cancelled", reverted_at: new Date().toISOString() })
        .eq("user_id", user_id).eq("status", "active");

      // Update user_roles to new role
      if (existingRole) {
        await adminClient.from("user_roles")
          .update({ role })
          .eq("user_id", user_id).eq("restaurant_id", profile.restaurant_id);
      } else {
        await adminClient.from("user_roles").insert({
          user_id, role, restaurant_id: profile.restaurant_id,
        });
      }

      const startsAt = new Date();
      const expiresAt = assignment_type === "temporary"
        ? new Date(startsAt.getTime() + duration_hours * 3600 * 1000)
        : null;

      const { data: assignment, error: insErr } = await adminClient
        .from("role_assignments").insert({
          restaurant_id: profile.restaurant_id,
          user_id,
          staff_email: profile.email,
          staff_name: profile.name,
          previous_role: previousRole,
          assigned_role: role,
          assignment_type,
          duration_hours: assignment_type === "temporary" ? duration_hours : null,
          starts_at: startsAt.toISOString(),
          expires_at: expiresAt?.toISOString() ?? null,
          status: "active",
          assigned_by: caller.id,
          assigned_by_email: caller.email,
          notes: notes || null,
        }).select().single();
      if (insErr) return json({ error: insErr.message }, 400);

      await adminClient.from("system_logs").insert({
        actor_id: caller.id, actor_email: caller.email,
        action: "staff.role_assigned", entity_type: "staff", entity_id: user_id,
        details: {
          restaurant_id: profile.restaurant_id,
          staff_email: profile.email, staff_name: profile.name,
          from_role: previousRole, to_role: role,
          assignment_type, duration_hours: duration_hours ?? null,
          expires_at: expiresAt?.toISOString() ?? null,
          assignment_id: assignment.id, notes: notes || null,
        },
      });

      return json({ success: true, assignment });
    }

    if (action === "revert_role") {
      const { assignment_id } = body;
      if (!assignment_id) return json({ error: "assignment_id required" }, 400);

      const { data: assignment } = await adminClient
        .from("role_assignments").select("*").eq("id", assignment_id).single();
      if (!assignment) return json({ error: "Assignment not found" }, 404);
      if (assignment.status !== "active") return json({ error: "Assignment not active" }, 400);

      if (callerRole.role === "restaurant_admin" && assignment.restaurant_id !== callerRole.restaurant_id) {
        return json({ error: "Forbidden" }, 403);
      }

      // Revert role
      if (assignment.previous_role) {
        await adminClient.from("user_roles")
          .update({ role: assignment.previous_role })
          .eq("user_id", assignment.user_id)
          .eq("restaurant_id", assignment.restaurant_id);
      }

      await adminClient.from("role_assignments")
        .update({ status: "cancelled", reverted_at: new Date().toISOString() })
        .eq("id", assignment_id);

      await adminClient.from("system_logs").insert({
        actor_id: caller.id, actor_email: caller.email,
        action: "staff.role_manually_reverted", entity_type: "staff",
        entity_id: assignment.user_id,
        details: {
          restaurant_id: assignment.restaurant_id,
          staff_email: assignment.staff_email,
          from_role: assignment.assigned_role,
          to_role: assignment.previous_role,
          assignment_id,
        },
      });

      return json({ success: true });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
