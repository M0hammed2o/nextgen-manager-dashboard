import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { MenuImagePage, UploadUrlResponse } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/shared/PageComponents';
import { Plus, Trash2, Loader2, ArrowUp, ArrowDown, ImageUp, Pencil } from 'lucide-react';
import { useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const IMAGE_MAX_MB = 5;
const MAX_PAGES = 20; // mirrors routes_menu_images.py::MAX_PAGES_PER_BUSINESS

/**
 * Multiple named, ordered menu-image pages (e.g. Mochachos Westville's
 * "Regular Menu — Page 1/2" + "Secret Creations"). Independent of the
 * single Menu Image field above this section — a business can use
 * either or both. Backend: routes_menu_images.py, migration 0058.
 */
export default function MenuImagesManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [addName, setAddName] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [pendingAddFile, setPendingAddFile] = useState<File | null>(null);
  const [renameTarget, setRenameTarget] = useState<MenuImagePage | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<MenuImagePage | null>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);

  const { data: pages = [], isLoading } = useQuery({
    queryKey: ['menu-image-pages'],
    queryFn: () => apiClient.get<MenuImagePage[]>('/v1/business/menu-images'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['menu-image-pages'] });

  const createMutation = useMutation({
    mutationFn: (body: { asset_id: string; name: string }) =>
      apiClient.post<MenuImagePage>('/v1/business/menu-images', body),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Page added' });
      setShowAddDialog(false);
      setAddName('');
      setPendingAddFile(null);
    },
    onError: (err: Error) =>
      toast({ title: 'Could not add page', description: err.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<{ name: string; asset_id: string; is_active: boolean }> }) =>
      apiClient.put<MenuImagePage>(`/v1/business/menu-images/${id}`, body),
    onSuccess: () => {
      invalidate();
      setRenameTarget(null);
    },
    onError: (err: Error) =>
      toast({ title: 'Could not update page', description: err.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/v1/business/menu-images/${id}`),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Page deleted' });
      setDeleteTarget(null);
    },
    onError: (err: Error) =>
      toast({ title: 'Could not delete page', description: err.message, variant: 'destructive' }),
  });

  const reorderMutation = useMutation({
    mutationFn: (order: { id: string; sort_order: number }[]) =>
      apiClient.post<MenuImagePage[]>('/v1/business/menu-images/reorder', { order }),
    onSuccess: invalidate,
    onError: (err: Error) =>
      toast({ title: 'Could not reorder', description: err.message, variant: 'destructive' }),
  });

  const validateFile = (file: File): boolean => {
    if (!IMAGE_TYPES.includes(file.type)) {
      toast({ title: 'Unsupported file type', description: 'Please choose a PNG, JPEG or WebP image.', variant: 'destructive' });
      return false;
    }
    if (file.size > IMAGE_MAX_MB * 1024 * 1024) {
      toast({ title: 'File too large', description: `Please choose an image under ${IMAGE_MAX_MB}MB.`, variant: 'destructive' });
      return false;
    }
    return true;
  };

  const uploadAsset = async (file: File): Promise<string> => {
    const { upload_url, asset_id } = await apiClient.post<UploadUrlResponse>(
      '/v1/business/assets/upload-url',
      { kind: 'BUSINESS_MENU_IMAGE', content_type: file.type },
    );
    await apiClient.uploadFile(upload_url, file);
    return asset_id;
  };

  const handleAddFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !validateFile(file)) return;
    setPendingAddFile(file);
    setAddName(file.name.replace(/\.[^.]+$/, ''));
    setShowAddDialog(true);
  };

  const handleConfirmAdd = async () => {
    if (!pendingAddFile || !addName.trim()) return;
    setIsUploading(true);
    try {
      const asset_id = await uploadAsset(pendingAddFile);
      createMutation.mutate({ asset_id, name: addName.trim() });
    } catch (err) {
      toast({ title: 'Upload failed', description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleReplaceFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !validateFile(file) || !replaceTargetId) return;
    setIsUploading(true);
    try {
      const asset_id = await uploadAsset(file);
      updateMutation.mutate({ id: replaceTargetId, body: { asset_id } });
      toast({ title: 'Image replaced' });
    } catch (err) {
      toast({ title: 'Upload failed', description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
      setReplaceTargetId(null);
    }
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= pages.length) return;
    const reordered = [...pages];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    reorderMutation.mutate(reordered.map((p, i) => ({ id: p.id, sort_order: i })));
  };

  return (
    <section className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Menu Image Pages</h3>
          <p className="text-sm text-muted-foreground">
            Multiple named pages — e.g. "Regular Menu — Page 1/2", "Secret Creations".
            Independent of the single Menu Image above.
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          disabled={pages.length >= MAX_PAGES || isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <Plus className="w-4 h-4" /> Add Page
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          onChange={handleAddFileSelect}
          className="hidden"
        />
        <input
          ref={replaceInputRef}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          onChange={handleReplaceFileSelect}
          className="hidden"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : pages.length === 0 ? (
        <EmptyState
          icon={<ImageUp className="w-12 h-12" />}
          title="No menu-image pages yet"
          description="Add your first page — e.g. a photo of your Secret Creations menu."
          action={<Button onClick={() => fileInputRef.current?.click()}><Plus className="w-4 h-4 mr-1" /> Add Page</Button>}
        />
      ) : (
        <div className="space-y-3">
          {pages.map((page, index) => (
            <div key={page.id} className="flex items-center gap-3 border border-border rounded-lg p-3">
              {page.image_url ? (
                <img src={page.image_url} alt={page.name} className="w-16 h-16 object-cover rounded-md border border-border flex-shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-md border border-border flex-shrink-0 bg-muted" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{page.name}</p>
                <p className="text-xs text-muted-foreground">Position {index + 1} of {pages.length}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button variant="ghost" size="icon" disabled={index === 0 || reorderMutation.isPending} onClick={() => move(index, -1)} title="Move up">
                  <ArrowUp className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" disabled={index === pages.length - 1 || reorderMutation.isPending} onClick={() => move(index, 1)} title="Move down">
                  <ArrowDown className="w-4 h-4" />
                </Button>
                <Switch
                  checked={page.is_active}
                  onCheckedChange={(v) => updateMutation.mutate({ id: page.id, body: { is_active: v } })}
                  title={page.is_active ? 'Active — shown to customers' : 'Inactive — hidden from customers'}
                />
                <Button variant="ghost" size="icon" onClick={() => { setRenameTarget(page); setRenameValue(page.name); }} title="Rename">
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost" size="icon"
                  disabled={isUploading}
                  onClick={() => { setReplaceTargetId(page.id); replaceInputRef.current?.click(); }}
                  title="Replace image"
                >
                  <ImageUp className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(page)} title="Delete">
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add page: name confirmation after file selection */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { if (!open) { setShowAddDialog(false); setPendingAddFile(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Name this page</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Page name</Label>
            <Input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="e.g. Secret Creations" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={handleConfirmAdd} disabled={!addName.trim() || isUploading || createMutation.isPending}>
              {(isUploading || createMutation.isPending) && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => { if (!open) setRenameTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename page</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Page name</Label>
            <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button
              disabled={!renameValue.trim() || updateMutation.isPending}
              onClick={() => renameTarget && updateMutation.mutate({ id: renameTarget.id, body: { name: renameValue.trim() } })}
            >
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the page from your menu. The underlying image file is kept and can be reused.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
