import { useState, useEffect } from 'react';
import { Clock, RotateCcw, History, ArrowRight, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useRoleAssignments, type RoleAssignment } from '@/hooks/useRoleAssignments';
import { useToast } from '@/hooks/use-toast';

const ROLE_LABEL: Record<string, string> = {
  manager: 'Manager',
  kitchen_staff: 'Kitchen',
  waiter_staff: 'Waiter',
  billing_staff: 'Billing',
  restaurant_admin: 'Admin',
  super_admin: 'Super Admin',
};

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  expired: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-amber-100 text-amber-700',
};

const formatRemaining = (expiresAt: string | null) => {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'expiring…';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
};

interface Props {
  restaurantId: string | null | undefined;
}

export const RoleAssignmentHistory = ({ restaurantId }: Props) => {
  const { data: assignments = [], isLoading, revertRole } = useRoleAssignments(restaurantId);
  const { toast } = useToast();
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const handleRevert = async (a: RoleAssignment) => {
    try {
      await revertRole.mutateAsync(a.id);
      toast({ title: 'Reverted', description: 'Role reverted successfully' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <Card className="border-0 shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="w-5 h-5" />
          Role Assignment History
        </CardTitle>
        <CardDescription>
          Audit log of every role change, including auto-reverted temporary assignments
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : assignments.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <History className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No role assignments yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Expires / Reverted</TableHead>
                  <TableHead>Assigned By</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => {
                  const remaining = a.status === 'active' && a.assignment_type === 'temporary'
                    ? formatRemaining(a.expires_at)
                    : null;
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="font-medium">{a.staff_name || '-'}</div>
                        <div className="text-xs text-muted-foreground">{a.staff_email}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <span className="text-muted-foreground">
                            {a.previous_role ? ROLE_LABEL[a.previous_role] || a.previous_role : '—'}
                          </span>
                          <ArrowRight className="w-3 h-3" />
                          <span className="font-medium">
                            {ROLE_LABEL[a.assigned_role] || a.assigned_role}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {a.assignment_type === 'temporary' ? (
                          <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                            <Clock className="w-3 h-3 mr-1" />
                            {a.duration_hours}h
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Permanent</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {new Date(a.starts_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs">
                        {a.reverted_at
                          ? new Date(a.reverted_at).toLocaleString()
                          : a.expires_at
                            ? (
                              <div>
                                <div>{new Date(a.expires_at).toLocaleString()}</div>
                                {remaining && (
                                  <div className="text-emerald-600 font-medium">{remaining}</div>
                                )}
                              </div>
                            )
                            : '—'}
                      </TableCell>
                      <TableCell className="text-xs">{a.assigned_by_email || 'system'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={STATUS_STYLES[a.status]}>
                          {a.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {a.status === 'active' && a.assignment_type === 'temporary' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRevert(a)}
                            disabled={revertRole.isPending}
                          >
                            <RotateCcw className="w-4 h-4 mr-1" />
                            Revert now
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
