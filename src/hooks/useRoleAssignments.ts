import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

export interface RoleAssignment {
  id: string;
  restaurant_id: string;
  user_id: string;
  staff_email: string | null;
  staff_name: string | null;
  previous_role: AppRole | null;
  assigned_role: AppRole;
  assignment_type: 'permanent' | 'temporary';
  duration_hours: number | null;
  starts_at: string;
  expires_at: string | null;
  reverted_at: string | null;
  status: 'active' | 'expired' | 'cancelled';
  assigned_by: string | null;
  assigned_by_email: string | null;
  notes: string | null;
  created_at: string;
}

export const useRoleAssignments = (restaurantId: string | null | undefined) => {
  const queryClient = useQueryClient();

  const queryKey = ['role-assignments', restaurantId ?? 'all'];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase
        .from('role_assignments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (restaurantId) q = q.eq('restaurant_id', restaurantId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as RoleAssignment[];
    },
    enabled: restaurantId !== undefined,
  });

  useEffect(() => {
    if (restaurantId === undefined) return;
    const channel = supabase
      .channel(`role-assignments-${restaurantId ?? 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'role_assignments' },
        () => {
          queryClient.invalidateQueries({ queryKey });
          queryClient.invalidateQueries({ queryKey: ['staff-members'] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, queryClient]);

  const assignRole = useMutation({
    mutationFn: async (payload: {
      user_id: string;
      role: AppRole;
      assignment_type: 'permanent' | 'temporary';
      duration_hours?: number;
      notes?: string;
    }) => {
      const res = await supabase.functions.invoke('manage-staff', {
        body: { action: 'assign_role', ...payload },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['staff-members'] });
    },
  });

  const revertRole = useMutation({
    mutationFn: async (assignment_id: string) => {
      const res = await supabase.functions.invoke('manage-staff', {
        body: { action: 'revert_role', assignment_id },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['staff-members'] });
    },
  });

  return { ...query, assignRole, revertRole };
};
