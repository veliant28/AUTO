'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { Shield, Plus, Pencil, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from '@/lib/toast';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

const roleBadgeColors: Record<string, string> = {
  admin: 'bg-red-500 text-white',
  manager: 'bg-blue-500 text-white',
  operator: 'bg-orange-500 text-white',
  b2b: 'bg-green-500 text-white',
  retail: 'bg-gray-500 text-white',
};

interface Permission {
  id: number;
  codename: string;
  description: string | null;
  group_name: string | null;
}

interface Role {
  id: number;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string | null;
  updated_at: string | null;
  permissions: Permission[];
}

const columnHelper = createColumnHelper<Role>();

function hasRole(user: { role: string } | null, ...roles: string[]) {
  if (!user) return false;
  return roles.includes(user.role);
}

export default function AdminRolesPage() {
  const { user } = useAuthStore();
  const t = useTranslations('admin');
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    permission_ids: [] as number[],
  });

  if (!hasRole(user, 'admin')) {
    return null;
  }

  useEffect(() => {
    (window as any).__openCreateRole = () => setCreateOpen(true);
    return () => { delete (window as any).__openCreateRole; };
  }, []);

  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ['admin-roles'],
    queryFn: async () => {
      const { data } = await api.get('/admin/roles');
      return data as Role[];
    },
  });

  const { data: permissions } = useQuery({
    queryKey: ['admin-permissions'],
    queryFn: async () => {
      const { data } = await api.get('/admin/permissions');
      return data as Permission[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      const { data } = await api.post('/admin/roles', {
        name: payload.name,
        description: payload.description || null,
        permission_ids: payload.permission_ids,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-roles'] });
      toast.success(t('roles_created'));
      setCreateOpen(false);
      resetForm();
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || t('save_error')),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: typeof form }) => {
      const { data } = await api.put(`/admin/roles/${id}`, {
        name: payload.name,
        description: payload.description || null,
        permission_ids: payload.permission_ids,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-roles'] });
      toast.success(t('roles_updated'));
      setEditRole(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || t('save_error')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/roles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-roles'] });
      toast.success(t('roles_deleted'));
      setDeleteTarget(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || t('roles_delete_error')),
  });

  const resetForm = () => {
    setForm({ name: '', description: '', permission_ids: [] });
  };

  const togglePermission = (permId: number) => {
    setForm((prev) => ({
      ...prev,
      permission_ids: prev.permission_ids.includes(permId)
        ? prev.permission_ids.filter((id) => id !== permId)
        : [...prev.permission_ids, permId],
    }));
  };

  const groupedPermissions = useMemo(() => {
    if (!permissions) return {};
    const groups: Record<string, Permission[]> = {};
    for (const p of permissions) {
      const key = p.group_name || 'Other';
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }
    return groups;
  }, [permissions]);

  const openEdit = (role: Role) => {
    setEditRole(role);
    setForm({
      name: role.name,
      description: role.description || '',
      permission_ids: role.permissions.map((p) => p.id),
    });
  };

  const columns = useMemo(() => [
    columnHelper.accessor('name', {
      header: t('roles_name'),
      cell: (info) => (
        <Badge className={`${roleBadgeColors[info.getValue()] || 'bg-gray-500 text-white'} border-0 text-sm`}>
          {t(info.getValue())}
        </Badge>
      ),
    }),
    columnHelper.accessor('is_system', {
      header: t('roles_type'),
      size: 120,
      cell: (info) => info.getValue()
        ? <Badge variant="outline" className="text-sm border-primary text-primary">{t('roles_system')}</Badge>
        : <span className="text-xs text-muted-foreground">{t('roles_custom')}</span>,
    }),
    columnHelper.accessor('description', {
      header: t('roles_description'),
      cell: (info) => info.getValue() || '—',
    }),
    columnHelper.accessor('permissions', {
      header: t('roles_permissions_count'),
      size: 80,
      cell: (info) => info.getValue().length,
    }),
    columnHelper.display({
      id: 'actions',
      header: t('actions'),
      size: 120,
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openEdit(row.original)}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="destructive"
            size="icon"
            className="h-8 w-8"
            disabled={row.original.is_system}
            onClick={() => setDeleteTarget(row.original)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ),
    }),
  ], [t]);

  const table = useReactTable({
    data: roles || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="p-6">
        <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (open) resetForm(); }}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" aria-describedby={null}>
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">{t('roles_create')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">{t('roles_name')}</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">{t('roles_description')}</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">{t('roles_permissions')}</label>
                {Object.entries(groupedPermissions).map(([group, perms]) => (
                  <div key={group} className="mb-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{group}</p>
                    <div className="grid grid-cols-2 gap-1">
                      {perms.map((p) => (
                        <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                          <input
                            type="checkbox"
                            checked={form.permission_ids.includes(p.id)}
                            onChange={() => togglePermission(p.id)}
                            className="cursor-pointer"
                          />
                          <span>{p.description || p.codename}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <Button
                className="w-full"
                onClick={() => createMutation.mutate(form)}
                disabled={createMutation.isPending || !form.name}
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {t('roles_create')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

      {rolesLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id} className="border-b bg-muted/50">
                      {hg.headers.map((header) => (
                        <th key={header.id} className="text-left p-3 font-medium text-muted-foreground" style={{ width: header.getSize() }}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="p-3">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {(!roles || roles.length === 0) && (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  {t('roles_empty')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {editRole && (
        <Dialog open={!!editRole} onOpenChange={(open) => { if (!open) setEditRole(null); }}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" aria-describedby={null}>
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">{t('roles_edit')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">{t('roles_name')}</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">{t('roles_description')}</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">{t('roles_permissions')}</label>
                {Object.entries(groupedPermissions).map(([group, perms]) => (
                  <div key={group} className="mb-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{group}</p>
                    <div className="grid grid-cols-2 gap-1">
                      {perms.map((p) => (
                        <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                          <input
                            type="checkbox"
                            checked={form.permission_ids.includes(p.id)}
                            onChange={() => togglePermission(p.id)}
                            className="cursor-pointer"
                          />
                          <span>{p.description || p.codename}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <Button
                className="w-full"
                onClick={() => updateMutation.mutate({ id: editRole.id, payload: form })}
                disabled={updateMutation.isPending || !form.name}
              >
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {t('roles_edit')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <DialogTitle>{t('roles_delete_confirm_title')}</DialogTitle>
                <DialogDescription>{t('roles_delete_confirm_message')}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {deleteTarget && (
            <div className="rounded-lg bg-muted p-3 text-sm min-w-0 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate min-w-0">{deleteTarget.name}</span>
                <Badge variant="outline" className="border-0 text-sm shrink-0">
                  {deleteTarget.is_system ? t('roles_system') : t('roles_custom')}
                </Badge>
              </div>
              {deleteTarget.description && (
                <p className="text-muted-foreground truncate">{deleteTarget.description}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('cancel')}</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate(deleteTarget!.id)} disabled={deleteMutation.isPending || (deleteTarget?.is_system ?? false)} className="gap-2">
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
