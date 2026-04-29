## Goal

In Staff Management, when an admin updates a staff role, allow them to assign it as either **Permanent** or **Temporary** (e.g., 8 hours, 12 hours, 24 hours, or custom). Temporary assignments auto-revert to the staff member's previous role when the duration expires, and every change is recorded in an audit log visible to the admin (e.g., "Assigned Ravi to Waiter today for 8 hours").

## What gets built

### 1. Database changes (new migration)

**New table: `role_assignments`** — tracks every role change (permanent and temporary) per restaurant.

Columns:
- `id` uuid PK
- `restaurant_id` uuid (FK restaurants, cascade)
- `user_id` uuid (the staff member)
- `staff_email` text, `staff_name` text (snapshot for log readability)
- `previous_role` app_role (nullable)
- `assigned_role` app_role
- `assignment_type` text: `'permanent' | 'temporary'`
- `duration_hours` int (null when permanent)
- `starts_at` timestamptz default now()
- `expires_at` timestamptz (null when permanent)
- `reverted_at` timestamptz (set when auto-revert runs)
- `status` text: `'active' | 'expired' | 'cancelled'`
- `assigned_by` uuid, `assigned_by_email` text
- `notes` text
- `created_at` timestamptz default now()

RLS:
- Restaurant admins / super admins: full manage on their restaurant rows
- Staff: SELECT own rows
- Realtime publication enabled

**Function `expire_temporary_roles()`** (SECURITY DEFINER):
- Finds rows where `status='active'`, `expires_at < now()`, `assignment_type='temporary'`
- Reverts `user_roles.role` to `previous_role` (or deletes if previous_role null)
- Marks row `status='expired'`, sets `reverted_at`
- Inserts a `system_logs` row for the revert

**pg_cron job**: Run `expire_temporary_roles()` every 5 minutes.

Also call `expire_temporary_roles()` lazily from the staff list query (defensive — covers cron downtime).

### 2. Edge function update: `manage-staff`

Add new actions:
- `assign_role`: payload `{ user_id, role, assignment_type, duration_hours?, notes? }`
  - Reads current role, writes new role to `user_roles`, inserts `role_assignments` row, inserts `system_logs` entry like `staff.role_assigned` with details (assigned_by, target, role, duration).
- `revert_role`: manually cancel an active temporary assignment immediately.

Server-side validation: only `restaurant_admin` / `super_admin` can call; staff role must be in the allowed staffRoles list; duration_hours must be 1–720 if temporary.

### 3. UI changes in `src/components/admin/UserManagement.tsx`

Replace the inline role dropdown edit with an **Assign Role dialog**:
- Role select (existing staff roles)
- Assignment type radio: **Permanent** / **Temporary**
- If Temporary: duration preset chips (4h, 8h, 12h, 24h, 48h) + "Custom hours" input
- Optional notes field
- Shows a preview line: "Ravi will be Waiter until Apr 30, 2026 8:42 PM"

In the staff table:
- New "Current Role" column shows the role badge plus, if active temp assignment exists, a small countdown chip: `Temp · 6h 23m left` with tooltip "Reverts to Kitchen at 8:42 PM".
- Real-time countdown updates client-side every minute.

### 4. New "Role Assignment History" panel

A new tab/section on the same page: table of recent assignments scoped to the restaurant — Staff, From → To, Type, Duration, Started, Expires/Reverted, Assigned By, Status. Filters by staff member and date range. Realtime-subscribed via `role_assignments` channel.

### 5. Hook: `src/hooks/useRoleAssignments.ts`

- `useActiveAssignments(restaurantId)` — list active temp assignments (joined with staff_profiles).
- `useAssignmentHistory(restaurantId, filters)` — paginated history.
- `useAssignRole()` mutation → calls `manage-staff` edge function with `assign_role`.
- `useRevertRole()` mutation → calls `revert_role`.
- Realtime subscription on `role_assignments` to invalidate queries.

## Technical notes

- `previous_role` lookup happens server-side in the edge function before mutating `user_roles`.
- Auto-revert is authoritative on the server (cron + lazy trigger). Client-side countdown is display-only.
- All writes go through the edge function (service role) so we keep RLS strict and ensure consistent log entries.
- Existing real-time subscription on `user_roles` already triggers staff list refresh — kept as-is.

## Files to add / change

Add:
- `supabase/migrations/<timestamp>_role_assignments.sql`
- `src/hooks/useRoleAssignments.ts`
- `src/components/admin/AssignRoleDialog.tsx`
- `src/components/admin/RoleAssignmentHistory.tsx`

Edit:
- `supabase/functions/manage-staff/index.ts` (add `assign_role` + `revert_role`)
- `src/components/admin/UserManagement.tsx` (replace inline edit with dialog, add countdown chip, add history tab)

## Out of scope

- Shift scheduling / recurring rotations (this is single-shot temporary assignments)
- Notifications/emails to staff on role change
- Payroll / hours worked reporting