import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { MenuAddOn, MenuCategory, MenuItem, CreateMenuItemRequest } from '@/types/api';
import { formatCents } from '@/lib/mappers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { PageSkeleton, EmptyState } from '@/components/shared/PageComponents';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  UtensilsCrossed, Plus, Edit, Trash2, Search, Loader2, Zap, Link2
} from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

// ── Shared money helper ───────────────────────────────────────────────────────

function parsePriceInput(val: string): number {
  return Math.round(parseFloat(val || '0') * 100);
}

// ════════════════════════════════════════════════════════════════════════════════
// MenuPage — tabbed: Items | Add-ons
// ════════════════════════════════════════════════════════════════════════════════

export default function MenuPage() {
  const { data: categories = [], isLoading: loadingCats } = useQuery({
    queryKey: ['menu-categories'],
    queryFn: () => apiClient.get<MenuCategory[]>('/v1/business/menu/categories'),
  });

  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ['menu-items'],
    queryFn: () => apiClient.get<MenuItem[]>('/v1/business/menu/items'),
  });

  const { data: addOns = [], isLoading: loadingAddOns } = useQuery({
    queryKey: ['menu-add-ons'],
    queryFn: () => apiClient.get<MenuAddOn[]>('/v1/business/menu/add-ons'),
  });

  if (loadingCats || loadingItems || loadingAddOns) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Menu</h1>
        <p className="text-sm text-muted-foreground">
          {items.length} items · {categories.length} categories · {addOns.length} add-ons
        </p>
      </div>

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="addons">
            Add-ons
            {addOns.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">{addOns.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-6">
          <ItemsTab categories={categories} items={items} />
        </TabsContent>

        <TabsContent value="addons" className="mt-6">
          <AddOnsTab addOns={addOns} items={items} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// Items Tab (existing behaviour, unchanged)
// ════════════════════════════════════════════════════════════════════════════════

function ItemsTab({ categories, items }: { categories: MenuCategory[]; items: MenuItem[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/v1/business/menu/items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items'] });
      toast({ title: 'Item deleted' });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/v1/business/menu/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-categories'] });
      queryClient.invalidateQueries({ queryKey: ['menu-items'] });
      toast({ title: 'Category deleted' });
    },
    onError: (err: Error) => toast({ title: 'Cannot delete category', description: err.message, variant: 'destructive' }),
  });

  const filteredItems = items.filter(item => {
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === 'all' || item.category_id === categoryFilter;
    return matchSearch && matchCat;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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
          {categories.map(c => {
            const itemCount = items.filter(i => i.category_id === c.id).length;
            return (
              <div key={c.id} className="flex items-center gap-1 bg-muted rounded-lg px-3 py-1.5 text-sm font-medium">
                <span>{c.name}</span>
                <span className="text-xs text-muted-foreground ml-1">({itemCount})</span>
                <Button
                  variant="ghost" size="icon" className="h-5 w-5 ml-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() => { setEditingCategory(c); setShowEditCategoryModal(true); }}
                >
                  <Edit className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-destructive"
                  disabled={deleteCategoryMutation.isPending}
                  onClick={() => {
                    if (itemCount > 0) {
                      toast({ title: 'Cannot delete category', description: `"${c.name}" has ${itemCount} item${itemCount !== 1 ? 's' : ''}. Remove or reassign them first.`, variant: 'destructive' });
                      return;
                    }
                    if (window.confirm(`Delete category "${c.name}"?`)) deleteCategoryMutation.mutate(c.id);
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items..." className="pl-9" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
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
          {filteredItems.map(item => (
            <div key={item.id} className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/20 transition-colors">
              {item.image_url && <img src={item.image_url} alt={item.name} className="w-full h-40 object-cover" />}
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0 mr-2">
                    <h3 className="font-semibold text-foreground">{item.name}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">{item.description ?? ''}</p>
                    {item.add_ons?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {item.add_ons.slice(0, 3).map(ao => (
                          <span key={ao.id} className="text-xs bg-primary/8 text-primary px-1.5 py-0.5 rounded">
                            +{ao.name}
                          </span>
                        ))}
                        {item.add_ons.length > 3 && (
                          <span className="text-xs text-muted-foreground">+{item.add_ons.length - 3} more</span>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-sm font-bold text-primary shrink-0">{formatCents(item.price_cents)}</span>
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
          <MenuItemForm item={editingItem} categories={categories} onClose={() => setShowItemModal(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={showEditCategoryModal} onOpenChange={open => { setShowEditCategoryModal(open); if (!open) setEditingCategory(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename Category</DialogTitle></DialogHeader>
          {editingCategory && (
            <CategoryEditForm category={editingCategory} onClose={() => { setShowEditCategoryModal(false); setEditingCategory(null); }} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// Add-ons Tab
// ════════════════════════════════════════════════════════════════════════════════

function AddOnsTab({ addOns, items }: { addOns: MenuAddOn[]; items: MenuItem[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAddOn, setEditingAddOn] = useState<MenuAddOn | null>(null);
  const [managingAddOn, setManagingAddOn] = useState<MenuAddOn | null>(null);

  const deleteAddOnMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/v1/business/menu/add-ons/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-add-ons'] });
      queryClient.invalidateQueries({ queryKey: ['menu-items'] });
      toast({ title: 'Add-on deleted' });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const attachedItemCount = (ao: MenuAddOn) =>
    items.filter(item => item.add_ons?.some(a => a.id === ao.id)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Create paid extras like Extra Cheese or Extra Patty, then attach them to menu items.
        </p>
        <Button className="gap-1.5 shrink-0" onClick={() => { setEditingAddOn(null); setShowCreateModal(true); }}>
          <Plus className="w-4 h-4" /> New Add-on
        </Button>
      </div>

      {addOns.length === 0 ? (
        <EmptyState
          icon={<Zap className="w-12 h-12" />}
          title="No add-ons yet"
          description="Add paid extras like Extra Cheese (+R10) or Extra Patty (+R25)"
          action={
            <Button onClick={() => { setEditingAddOn(null); setShowCreateModal(true); }}>
              <Plus className="w-4 h-4 mr-1" /> New Add-on
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {addOns.map(ao => {
            const count = attachedItemCount(ao);
            return (
              <div key={ao.id} className="flex items-center gap-4 bg-card border border-border rounded-xl px-4 py-3">
                {/* Name + limits */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{ao.name}</span>
                    {!ao.is_active && (
                      <Badge variant="secondary" className="text-xs">Inactive</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    <span>Max {ao.max_qty} per order</span>
                    {count > 0 ? (
                      <span className="text-primary">{count} item{count !== 1 ? 's' : ''}</span>
                    ) : (
                      <span className="text-amber-500">Not attached to any item</span>
                    )}
                  </div>
                </div>

                {/* Price */}
                <span className="text-sm font-bold text-primary shrink-0">
                  +{formatCents(ao.price_cents)}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs h-8"
                    onClick={() => setManagingAddOn(ao)}
                    title="Attach to menu items"
                  >
                    <Link2 className="w-3 h-3" />
                    Items
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => { setEditingAddOn(ao); setShowCreateModal(true); }}
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    disabled={deleteAddOnMutation.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete "${ao.name}"? It will be removed from all menu items.`)) {
                        deleteAddOnMutation.mutate(ao.id);
                      }
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit add-on */}
      <Dialog
        open={showCreateModal}
        onOpenChange={open => { setShowCreateModal(open); if (!open) setEditingAddOn(null); }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingAddOn ? 'Edit Add-on' : 'New Add-on'}</DialogTitle>
          </DialogHeader>
          <AddOnForm
            addOn={editingAddOn}
            onClose={() => { setShowCreateModal(false); setEditingAddOn(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Attach to items */}
      <Dialog
        open={!!managingAddOn}
        onOpenChange={open => { if (!open) setManagingAddOn(null); }}
      >
        <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Attach "{managingAddOn?.name}" to items</DialogTitle>
          </DialogHeader>
          {managingAddOn && (
            <AttachItemsForm
              addOn={managingAddOn}
              items={items}
              onClose={() => setManagingAddOn(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Add-on create / edit form ─────────────────────────────────────────────────

function AddOnForm({ addOn, onClose }: { addOn: MenuAddOn | null; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(addOn?.name ?? '');
  const [price, setPrice] = useState(addOn ? String(addOn.price_cents / 100) : '');
  const [maxQty, setMaxQty] = useState(String(addOn?.max_qty ?? 3));
  const [isActive, setIsActive] = useState(addOn?.is_active ?? true);

  const mutation = useMutation({
    mutationFn: (data: object) =>
      addOn
        ? apiClient.put(`/v1/business/menu/add-ons/${addOn.id}`, data)
        : apiClient.post('/v1/business/menu/add-ons', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-add-ons'] });
      queryClient.invalidateQueries({ queryKey: ['menu-items'] });
      toast({ title: addOn ? 'Add-on updated' : 'Add-on created' });
      onClose();
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPrice = parsePriceInput(price);
    const parsedMax = Math.max(1, parseInt(maxQty) || 1);
    if (parsedPrice <= 0) {
      toast({ title: 'Price must be greater than 0', variant: 'destructive' });
      return;
    }
    const payload: Record<string, unknown> = {
      name: name.trim(),
      price_cents: parsedPrice,
      min_qty: 0,
      max_qty: parsedMax,
      default_qty: 1,
    };
    if (addOn) payload.is_active = isActive;
    mutation.mutate(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Name</Label>
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Extra Cheese"
          required
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label>Price (Rands)</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R</span>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            value={price}
            onChange={e => setPrice(e.target.value)}
            placeholder="10.00"
            className="pl-7"
            required
          />
        </div>
        <p className="text-xs text-muted-foreground">Amount added to the item total when selected</p>
      </div>

      <div className="space-y-2">
        <Label>Max quantity per order</Label>
        <Input
          type="number"
          min="1"
          max="10"
          value={maxQty}
          onChange={e => setMaxQty(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          e.g. 3 means a customer can add up to 3× this add-on per item
        </p>
      </div>

      {addOn && (
        <div className="flex items-center gap-2">
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          <Label>Active</Label>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : addOn ? 'Save' : 'Create'}
        </Button>
      </div>
    </form>
  );
}

// ── Attach add-on to items form ───────────────────────────────────────────────

function AttachItemsForm({
  addOn,
  items,
  onClose,
}: {
  addOn: MenuAddOn;
  items: MenuItem[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Which items currently have this add-on
  const initialAttached = new Set(
    items.filter(i => i.add_ons?.some(a => a.id === addOn.id)).map(i => i.id)
  );
  const [attached, setAttached] = useState<Set<string>>(new Set(initialAttached));
  const [saving, setSaving] = useState(false);

  const toggle = (itemId: string) => {
    setAttached(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const toAttach = items.filter(i => attached.has(i.id) && !initialAttached.has(i.id));
      const toDetach = items.filter(i => !attached.has(i.id) && initialAttached.has(i.id));

      await Promise.all([
        ...toAttach.map(i =>
          apiClient.post(`/v1/business/menu/items/${i.id}/add-ons/${addOn.id}`)
        ),
        ...toDetach.map(i =>
          apiClient.delete(`/v1/business/menu/items/${i.id}/add-ons/${addOn.id}`)
        ),
      ]);

      queryClient.invalidateQueries({ queryKey: ['menu-items'] });
      queryClient.invalidateQueries({ queryKey: ['menu-add-ons'] });
      toast({ title: 'Saved' });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const activeItems = items.filter(i => !i.is_active === false || i.is_active);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Tick the items that should offer <strong>{addOn.name}</strong> as an add-on.
      </p>

      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {activeItems.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No menu items yet</p>
        ) : (
          activeItems.map(item => (
            <label
              key={item.id}
              className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <Checkbox
                checked={attached.has(item.id)}
                onCheckedChange={() => toggle(item.id)}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{item.name}</p>
                <p className="text-xs text-muted-foreground">{formatCents(item.price_cents)}</p>
              </div>
            </label>
          ))
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
          Save
        </Button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// Shared sub-forms (categories + menu items)
// ════════════════════════════════════════════════════════════════════════════════

function CategoryForm({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const createMutation = useMutation({
    mutationFn: (data: { name: string }) => apiClient.post('/v1/business/menu/categories', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-categories'] });
      toast({ title: 'Category created' });
      onClose();
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  return (
    <form onSubmit={e => { e.preventDefault(); createMutation.mutate({ name }); }} className="space-y-4">
      <div className="space-y-2">
        <Label>Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} required autoFocus />
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
    mutationFn: (data: { name: string }) => apiClient.put(`/v1/business/menu/categories/${category.id}`, data),
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
      onSubmit={e => { e.preventDefault(); const t = name.trim(); if (t) updateMutation.mutate({ name: t }); }}
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

function MenuItemForm({
  item,
  categories,
  onClose,
}: {
  item: MenuItem | null;
  categories: MenuCategory[];
  onClose: () => void;
}) {
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
      price_cents: parsePriceInput(priceCents),
      category_id: categoryId || undefined,
    };
    if (item) payload.is_active = isAvailable;
    mutation.mutate(payload as CreateMenuItemRequest);
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
        <Label>Price (Rands)</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R</span>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={priceCents}
            onChange={e => setPriceCents(e.target.value)}
            required
            className="pl-7"
          />
        </div>
      </div>
      {item && (
        <div className="flex items-center gap-2">
          <Switch checked={isAvailable} onCheckedChange={setIsAvailable} />
          <Label>Available</Label>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : item ? 'Update' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
