import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { StaffMember, CreateStaffRequest } from '@/types/api';
import { formatDate } from '@/lib/mappers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PageSkeleton, EmptyState } from '@/components/shared/PageComponents';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Users, Plus, Edit, Trash2, KeyRound, Copy, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export default function StaffPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffMember | null>(null);
  const [rotatedPin, setRotatedPin] = useState<string | null>(null);

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: () => apiClient.get<StaffMember[]>('/v1/business/staff'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/v1/business/staff/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast({ title: 'Staff member removed' });
      setDeleteTarget(null);
    },
  });

  const rotatePinMutation = useMutation({
    mutationFn: (id: string) => apiClient.post<{ pin: string }>(`/v1/business/staff/${id}/pin/rotate`),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      setRotatedPin(data.pin);
      toast({ title: 'PIN rotated' });
    },
  });

  if (isLoading) return <PageSkeleton />;

  const managers = staff.filter(s => s.role === 'MANAGER' || s.role === 'OWNER');
  const staffMembers = staff.filter(s => s.role === 'STAFF');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Staff</h1>
          <p className="text-sm text-muted-foreground">{staff.length} team members</p>
        </div>
        <Button className="gap-1.5" onClick={() => { setEditing(null); setShowModal(true); }}>
          <Plus className="w-4 h-4" /> Add Staff
        </Button>
      </div>

      {staff.length === 0 ? (
        <EmptyState
          icon={<Users className="w-12 h-12" />}
          title="No staff members"
          description="Add managers and staff to your team"
          action={<Button onClick={() => setShowModal(true)}><Plus className="w-4 h-4 mr-1" /> Add Staff</Button>}
        />
      ) : (
        <div className="space-y-6">
          {managers.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Managers & Owners</h3>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <StaffTable members={managers} onEdit={(m) => { setEditing(m); setShowModal(true); }} onDelete={setDeleteTarget} onRotatePin={(m) => rotatePinMutation.mutate(m.id)} />
              </div>
            </div>
          )}
          {staffMembers.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Staff</h3>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <StaffTable members={staffMembers} onEdit={(m) => { setEditing(m); setShowModal(true); }} onDelete={setDeleteTarget} onRotatePin={(m) => rotatePinMutation.mutate(m.id)} />
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Staff' : 'Add Staff'}</DialogTitle></DialogHeader>
          <StaffForm member={editing} onClose={() => setShowModal(false)} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.staff_name}?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!rotatedPin} onOpenChange={() => setRotatedPin(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New PIN</DialogTitle></DialogHeader>
          <div className="text-center py-4">
            <p className="text-3xl font-mono font-bold text-foreground tracking-widest">{rotatedPin}</p>
            <p className="text-sm text-muted-foreground mt-2">Share this PIN with the staff member</p>
            <Button className="mt-4 gap-1.5" onClick={() => { navigator.clipboard.writeText(rotatedPin ?? ''); toast({ title: 'PIN copied' }); }}>
              <Copy className="w-4 h-4" /> Copy PIN
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StaffTable({ members, onEdit, onDelete, onRotatePin }: {
  members: StaffMember[];
  onEdit: (m: StaffMember) => void;
  onDelete: (m: StaffMember) => void;
  onRotatePin: (m: StaffMember) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-left p-4 font-medium text-muted-foreground">Name</th>
            <th className="text-left p-4 font-medium text-muted-foreground">Role</th>
            <th className="text-left p-4 font-medium text-muted-foreground">Status</th>
            <th className="text-left p-4 font-medium text-muted-foreground">Joined</th>
            <th className="text-right p-4 font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
              <td className="p-4">
                <p className="font-medium text-foreground">{m.staff_name}</p>
                {m.email && <p className="text-xs text-muted-foreground">{m.email}</p>}
              </td>
              <td className="p-4 text-foreground capitalize">{m.role.toLowerCase()}</td>
              <td className="p-4">
                <span className={`text-xs px-2 py-0.5 rounded-full ${m.is_active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  {m.is_active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td className="p-4 text-muted-foreground">{formatDate(m.created_at)}</td>
              <td className="p-4 text-right">
                <div className="flex items-center justify-end gap-1">
                  {m.role === 'STAFF' && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Rotate PIN" onClick={() => onRotatePin(m)}>
                      <KeyRound className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(m)}><Edit className="w-3.5 h-3.5" /></Button>
                  {m.role !== 'OWNER' && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(m)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StaffForm({ member, onClose }: { member: StaffMember | null; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(member?.staff_name ?? '');
  const [email, setEmail] = useState(member?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'STAFF' | 'MANAGER'>(member?.role === 'MANAGER' ? 'MANAGER' : 'STAFF');
  const [pin, setPin] = useState('');
  const [isActive, setIsActive] = useState(member?.is_active ?? true);

  const mutation = useMutation({
    mutationFn: (data: CreateStaffRequest & { is_active?: boolean }) =>
      member ? apiClient.put(`/v1/business/staff/${member.id}`, data) : apiClient.post('/v1/business/staff', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast({ title: member ? 'Staff updated' : 'Staff created' });
      onClose();
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: CreateStaffRequest & { is_active?: boolean } = {
      staff_name: name,
      role,
      is_active: isActive,
    };
    if (role === 'MANAGER') {
      data.email = email;
      if (password) data.password = password;
    } else {
      if (pin) data.pin = pin;
    }
    mutation.mutate(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} required /></div>
      <div className="space-y-2">
        <Label>Role</Label>
        <Select value={role} onValueChange={(v) => setRole(v as 'STAFF' | 'MANAGER')}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="STAFF">Staff (PIN login)</SelectItem>
            <SelectItem value="MANAGER">Manager (Email login)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {role === 'MANAGER' && (
        <>
          <div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
          <div className="space-y-2"><Label>{member ? 'New Password (optional)' : 'Password'}</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required={!member} /></div>
        </>
      )}
      {role === 'STAFF' && !member && (
        <div className="space-y-2"><Label>Initial PIN (optional)</Label><Input value={pin} onChange={e => setPin(e.target.value)} placeholder="Auto-generated if empty" /></div>
      )}
      <div className="flex items-center gap-2"><Switch checked={isActive} onCheckedChange={setIsActive} /><Label>Active</Label></div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : member ? 'Update' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
