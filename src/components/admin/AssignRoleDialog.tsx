import { useState, useMemo, useEffect } from 'react';
import { Loader2, Clock, Infinity as InfinityIcon } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { useRoleAssignments } from '@/hooks/useRoleAssignments';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: 'manager', label: 'Manager' },
  { value: 'kitchen_staff', label: 'Kitchen' },
  { value: 'waiter_staff', label: 'Waiter' },
  { value: 'billing_staff', label: 'Billing' },
];

const PRESETS = [4, 8, 12, 24, 48];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  staff: { user_id: string; name: string | null; email: string; role: AppRole } | null;
  restaurantId: string | null | undefined;
}

export const AssignRoleDialog = ({ open, onOpenChange, staff, restaurantId }: Props) => {
  const { toast } = useToast();
  const { assignRole } = useRoleAssignments(restaurantId);

  const [role, setRole] = useState<AppRole>('waiter_staff');
  const [type, setType] = useState<'permanent' | 'temporary'>('permanent');
  const [hours, setHours] = useState<number>(8);
  const [customHours, setCustomHours] = useState<string>('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open && staff) {
      setRole(staff.role);
      setType('permanent');
      setHours(8);
      setCustomHours('');
      setNotes('');
    }
  }, [open, staff]);

  const effectiveHours = useMemo(() => {
    if (type !== 'temporary') return null;
    const n = parseInt(customHours, 10);
    return Number.isFinite(n) && n > 0 ? n : hours;
  }, [type, hours, customHours]);

  const expiresAt = useMemo(() => {
    if (!effectiveHours) return null;
    return new Date(Date.now() + effectiveHours * 3600 * 1000);
  }, [effectiveHours]);

  const handleSubmit = async () => {
    if (!staff) return;
    if (type === 'temporary' && (!effectiveHours || effectiveHours < 1 || effectiveHours > 720)) {
      toast({ title: 'Invalid duration', description: 'Use 1–720 hours', variant: 'destructive' });
      return;
    }
    try {
      await assignRole.mutateAsync({
        user_id: staff.user_id,
        role,
        assignment_type: type,
        duration_hours: type === 'temporary' ? effectiveHours! : undefined,
        notes: notes.trim() || undefined,
      });
      toast({
        title: 'Role assigned',
        description: type === 'temporary'
          ? `${staff.name || staff.email} → ${ROLE_OPTIONS.find(r => r.value === role)?.label} for ${effectiveHours}h`
          : `${staff.name || staff.email} → ${ROLE_OPTIONS.find(r => r.value === role)?.label}`,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  if (!staff) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Role</DialogTitle>
          <DialogDescription>
            {staff.name || staff.email}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v: AppRole) => setRole(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Assignment Type</Label>
            <RadioGroup value={type} onValueChange={(v: 'permanent' | 'temporary') => setType(v)} className="grid grid-cols-2 gap-2">
              <label className={`flex items-center gap-2 border rounded-md p-3 cursor-pointer ${type === 'permanent' ? 'border-primary bg-primary/5' : ''}`}>
                <RadioGroupItem value="permanent" />
                <InfinityIcon className="w-4 h-4" />
                <span className="text-sm font-medium">Permanent</span>
              </label>
              <label className={`flex items-center gap-2 border rounded-md p-3 cursor-pointer ${type === 'temporary' ? 'border-primary bg-primary/5' : ''}`}>
                <RadioGroupItem value="temporary" />
                <Clock className="w-4 h-4" />
                <span className="text-sm font-medium">Temporary</span>
              </label>
            </RadioGroup>
          </div>

          {type === 'temporary' && (
            <div className="space-y-2">
              <Label>Duration</Label>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map(h => (
                  <Button
                    key={h}
                    type="button"
                    variant={hours === h && !customHours ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => { setHours(h); setCustomHours(''); }}
                  >
                    {h}h
                  </Button>
                ))}
              </div>
              <Input
                type="number"
                min={1}
                max={720}
                placeholder="Custom hours (1-720)"
                value={customHours}
                onChange={(e) => setCustomHours(e.target.value)}
              />
              {expiresAt && (
                <p className="text-xs text-muted-foreground">
                  Will revert to{' '}
                  <span className="font-medium">
                    {ROLE_OPTIONS.find(r => r.value === staff.role)?.label || staff.role}
                  </span>{' '}
                  at {expiresAt.toLocaleString()}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="e.g. Covering lunch shift"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={assignRole.isPending}>
            {assignRole.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
