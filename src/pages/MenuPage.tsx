import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { MenuCategory, MenuItem, CreateMenuItemRequest } from '@/types/api';
import { formatCents } from '@/lib/mappers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { PageSkeleton, EmptyState } from '@/components/shared/PageComponents';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { UtensilsCrossed, Plus, Edit, Trash2, Search, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export default function MenuPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);

  const { data: categories = [], isLoading: loadingCats } = useQuery({
    queryKey: ['menu-categories'],
    queryFn: () => apiClient.get<MenuCategory[]>('/v1/business/menu/categories'),
  });

  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ['menu-items'],
    queryFn: () => apiClient.get<MenuItem[]>('/v1/business/menu/items'),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/v1/business/menu/items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items'] });
      toast({ title: 'Item deleted' });
    },
  });

  if (loadingCats || loadingItems) return <PageSkeleton />;

  const filteredItems = items.filter(item => {
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === 'all' || item.category_id === categoryFilter;
    return matchSearch && matchCat;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Menu</h1>
          <p className="text-sm text-muted-foreground">{items.length} items · {categories.length} categories</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={showCategoryModal} onOpenChange={setShowCategoryModal}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-1.5"><Plus className="w-4 h-4" /> Category</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Category</DialogTitle></DialogHeader>
              <CategoryForm onClose={() => setShowCategoryModal(false)} />
            </DialogContent>
          </Dialog>
          <Button className="gap-1.5" onClick={() => { setEditingItem(null); setShowItemModal(true); }}>
            <Plus className="w-4 h-4" /> Add Item
          </Button>
        </div>
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {categories.map(c => (
            <div key={c.id} className="flex items-center gap-1 bg-muted rounded-lg px-3 py-1.5 text-sm font-medium">
              <span>{c.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 ml-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => { setEditingCategory(c); setShowEditCategoryModal(true); }}
              >
                <Edit className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search items..."
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredItems.length === 0 ? (
        <EmptyState
          icon={<UtensilsCrossed className="w-12 h-12" />}
          title="No menu items"
          description="Start by adding categories and items to your menu"
          action={<Button onClick={() => { setEditingItem(null); setShowItemModal(true); }}><Plus className="w-4 h-4 mr-1" /> Add Item</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <div key={item.id} className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/20 transition-colors">
              {item.image_url && (
                <img src={item.image_url} alt={item.name} className="w-full h-40 object-cover" />
              )}
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-foreground">{item.name}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">{item.description ?? ''}</p>
                  </div>
                  <span className="text-sm font-bold text-primary">{formatCents(item.price_cents)}</span>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${item.is_active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {item.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingItem(item); setShowItemModal(true); }}>
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteItemMutation.mutate(item.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showItemModal} onOpenChange={setShowItemModal}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingItem ? 'Edit Item' : 'Add Item'}</DialogTitle></DialogHeader>
          <MenuItemForm
            item={editingItem}
            categories={categories}
            onClose={() => setShowItemModal(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={showEditCategoryModal}
        onOpenChange={open => { setShowEditCategoryModal(open); if (!open) setEditingCategory(null); }}
      >
        <DialogContent>
          <DialogHeader><DialogTitle>Rename Category</DialogTitle></DialogHeader>
          {editingCategory && (
            <CategoryEditForm
              category={editingCategory}
              onClose={() => { setShowEditCategoryModal(false); setEditingCategory(null); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryForm({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const createMutation = useMutation({
    mutationFn: (data: { name: string }) => apiClient.post('/v1/business/menu/categories', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['menu-categories'] }); toast({ title: 'Category created' }); onClose(); },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  return (
    <form onSubmit={e => { e.preventDefault(); createMutation.mutate({ name }); }} className="space-y-4">
      <div className="space-y-2">
        <Label>Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} required />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
        </Button>
      </div>
    </form>
  );
}

function CategoryEditForm({ category, onClose }: { category: MenuCategory; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(category.name);

  const updateMutation = useMutation({
    mutationFn: (data: { name: string }) =>
      apiClient.put(`/v1/business/menu/categories/${category.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-categories'] });
      queryClient.invalidateQueries({ queryKey: ['menu-items'] });
      toast({ title: 'Category renamed' });
      onClose();
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  return (
    <form
      onSubmit={e => { e.preventDefault(); const trimmed = name.trim(); if (trimmed) updateMutation.mutate({ name: trimmed }); }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label>Category Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} required autoFocus />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={updateMutation.isPending || !name.trim() || name.trim() === category.name}>
          {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
        </Button>
      </div>
    </form>
  );
}

function MenuItemForm({ item, categories, onClose }: { item: MenuItem | null; categories: MenuCategory[]; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [priceCents, setPriceCents] = useState(String((item?.price_cents ?? 0) / 100));
  const [categoryId, setCategoryId] = useState(item?.category_id ?? '');
  const [isAvailable, setIsAvailable] = useState(item?.is_active ?? true);

  const mutation = useMutation({
    mutationFn: (data: CreateMenuItemRequest) =>
      item
        ? apiClient.put(`/v1/business/menu/items/${item.id}`, data)
        : apiClient.post('/v1/business/menu/items', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items'] });
      toast({ title: item ? 'Item updated' : 'Item created' });
      onClose();
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      name,
      description: description || undefined,
      price_cents: Math.round(parseFloat(priceCents) * 100),
      category_id: categoryId || undefined,
    };
    // is_active only valid on update, not create
    if (item) payload.is_active = isAvailable;
    mutation.mutate(payload as any);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Category</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
          <SelectContent>
            {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Price</Label>
        <Input type="number" step="0.01" min="0" value={priceCents} onChange={e => setPriceCents(e.target.value)} required />
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={isAvailable} onCheckedChange={setIsAvailable} />
        <Label>Available</Label>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : item ? 'Update' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
