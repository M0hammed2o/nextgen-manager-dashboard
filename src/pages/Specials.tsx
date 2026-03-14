import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Special } from '@/types/api';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { PageSkeleton, EmptyState } from '@/components/shared/PageComponents';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Sparkles, Plus, Edit, Trash2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function SpecialsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Special | null>(null);

  const { data: specials = [], isLoading } = useQuery({
    queryKey: ['specials'],
    queryFn: () => apiClient.get<Special[]>('/v1/business/specials'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/v1/business/specials/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['specials'] });
      toast({ title: 'Special deleted' });
    },
  });

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Specials</h1>
          <p className="text-sm text-muted-foreground">{specials.length} specials</p>
        </div>
        <Button className="gap-1.5" onClick={() => { setEditing(null); setShowModal(true); }}>
          <Plus className="w-4 h-4" /> Add Special
        </Button>
      </div>

      {specials.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="w-12 h-12" />}
          title="No specials yet"
          description="Create daily or weekly specials for your customers"
          action={<Button onClick={() => { setEditing(null); setShowModal(true); }}><Plus className="w-4 h-4 mr-1" /> Create Special</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {specials.map((special) => (
            <div key={special.id} className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/20 transition-colors">
              {special.image_url && (
                <img src={special.image_url} alt={special.title} className="w-full h-40 object-cover" />
              )}
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-foreground">{special.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{special.description ?? ''}</p>
                {special.days_of_week && special.days_of_week.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {special.days_of_week.map(d => (
                      <span key={d} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{d.slice(0, 3)}</span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${special.is_active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {special.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(special); setShowModal(true); }}>
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(special.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit Special' : 'Add Special'}</DialogTitle></DialogHeader>
          <SpecialForm special={editing} onClose={() => setShowModal(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SpecialForm({ special, onClose }: { special: Special | null; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(special?.title ?? '');
  const [description, setDescription] = useState(special?.description ?? '');
  const [isActive, setIsActive] = useState(special?.is_active ?? true);
  const [days, setDays] = useState<string[]>(special?.days_of_week ?? []);
  const [startDate, setStartDate] = useState(special?.start_at?.slice(0, 10) ?? '');
  const [endDate, setEndDate] = useState(special?.end_at?.slice(0, 10) ?? '');

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      special ? apiClient.put(`/v1/business/specials/${special.id}`, data) : apiClient.post('/v1/business/specials', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['specials'] });
      toast({ title: special ? 'Special updated' : 'Special created' });
      onClose();
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const toggleDay = (day: string) => setDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      title,
      description: description || undefined,
      is_active: isActive,
      days_of_week: days.length > 0 ? days : undefined,
      start_at: startDate ? new Date(startDate + 'T00:00:00').toISOString() : undefined,
      end_at: endDate ? new Date(endDate + 'T23:59:59').toISOString() : undefined,
    };
    mutation.mutate(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} required /></div>
      <div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} /></div>
      <div className="space-y-2">
        <Label>Days of Week</Label>
        <div className="flex flex-wrap gap-2">
          {DAYS.map(day => (
            <label key={day} className="flex items-center gap-1.5 text-sm">
              <Checkbox checked={days.includes(day)} onCheckedChange={() => toggleDay(day)} />
              {day.slice(0, 3)}
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label>Start Date</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
        <div className="space-y-2"><Label>End Date</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
      </div>
      <div className="flex items-center gap-2"><Switch checked={isActive} onCheckedChange={setIsActive} /><Label>Active</Label></div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : special ? 'Update' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
