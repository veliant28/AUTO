'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import {
  Users, Plus, Search, Pencil, Trash2, AlertTriangle, Loader2,
} from 'lucide-react';
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
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/lib/toast';
import { PhoneInput, formatPhone } from '@/components/ui/PhoneInput';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

const roleBadgeColors: Record<string, string> = {
  admin: 'bg-red-500 text-white',
  manager: 'bg-blue-500 text-white',
  operator: 'bg-orange-500 text-white',
  b2b: 'bg-green-500 text-white',
  retail: 'bg-gray-500 text-white',
};

interface AdminUser {
  id: number;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  phone: string | null;
  created_at: string | null;
}

interface RoleOption {
  id: number;
  name: string;
  description: string | null;
}

const columnHelper = createColumnHelper<AdminUser>();

function hasRole(user: { role: string } | null, ...roles: string[]) {
  if (!user) return false;
  return roles.includes(user.role);
}

export default function AdminUsersPage() {
  const { user } = useAuthStore();
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  const [form, setForm] = useState({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    middle_name: '',
    role_id: 1,
    is_active: true,
    phone: '',
  });

  const { data: rolesData } = useQuery({
    queryKey: ['admin-roles'],
    queryFn: async () => {
      const { data } = await api.get('/admin/roles');
      return data as RoleOption[];
    },
  });

  useEffect(() => {
    (window as any).__openCreateUser = () => setCreateOpen(true);
    return () => { delete (window as any).__openCreateUser; };
  }, []);

  if (!hasRole(user, 'admin')) {
    return null;
  }

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', search, page],
    queryFn: async () => {
      const params: any = { page: page + 1, page_size: 20 };
      if (search) params.search = search;
      const { data } = await api.get('/admin/users', { params });
      return data as { items: AdminUser[]; total: number; page: number; page_size: number };
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      const { data } = await api.post('/admin/users', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(t('user_created'));
      setCreateOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      const { data } = await api.put(`/admin/users/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(t('user_updated'));
      setEditUser(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(t('user_deleted'));
      setDeleteTarget(null);
    },
    onError: () => {
      toast.error(t('users_delete_error'));
    },
  });

  const resetForm = () => {
    setForm({ email: '', password: '', first_name: '', last_name: '', middle_name: '', role_id: 1, is_active: true, phone: '' });
  };

  const columns = [
    columnHelper.accessor('id', {
      header: 'ID',
      size: 60,
    }),
    columnHelper.accessor('full_name', {
      header: tc('name_label'),
      cell: (info) => info.getValue() || '—',
    }),
    columnHelper.accessor('email', {
      header: 'Email',
    }),
    columnHelper.accessor('role', {
      header: t('role_label'),
      cell: (info) => (
        <Badge className={`${roleBadgeColors[info.getValue()] || 'bg-gray-500 text-white'} border-0 text-sm`}>
          {t(info.getValue())}
        </Badge>
      ),
    }),
    columnHelper.accessor('is_active', {
      header: t('is_active_label'),
      size: 80,
      cell: (info) => (
        <Badge variant={info.getValue() ? 'outline' : 'destructive'} className="text-sm">
          {info.getValue() ? t('yes') : t('no')}
        </Badge>
      ),
    }),
    columnHelper.accessor('phone', {
      header: t('phone_label'),
      cell: (info) => info.getValue() ? formatPhone(info.getValue()!) : '—',
    }),
    columnHelper.display({
      id: 'actions',
      header: t('actions'),
      size: 120,
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => {
            const u = row.original;
            setEditUser(u);
            const roleId = (rolesData || []).find((r) => r.name === u.role)?.id || 1;
            setForm({
              email: u.email,
              password: '',
              first_name: u.first_name || '',
              last_name: u.last_name || '',
              middle_name: u.middle_name || '',
              role_id: roleId,
              is_active: u.is_active,
              phone: u.phone || '',
            });
          }}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button variant="destructive" size="icon" onClick={() => setDeleteTarget(row.original)}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ),
    }),
  ];

  const table = useReactTable({
    data: data?.items || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination: { pageIndex: page, pageSize: 20 } },
    onPaginationChange: (updater) => {
      if (typeof updater === 'function') {
        const newState = updater({ pageIndex: page, pageSize: 20 });
        setPage(newState.pageIndex);
      }
    },
    manualPagination: true,
    pageCount: Math.ceil((data?.total || 0) / 20),
  });

  return (
    <div className="p-6">
        <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (open) resetForm(); }}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">{t('create_user')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input placeholder={tc('email_label')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder={t('phone_placeholder')} className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                <Input placeholder={tc('first_name_label')} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder={tc('last_name_label')} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                <Input placeholder={tc('middle_name_label')} value={form.middle_name} onChange={(e) => setForm({ ...form, middle_name: e.target.value })} />
              </div>
              <Input placeholder={tc('password_label')} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">{t('role_label')}</label>
                <Select value={String(form.role_id)} onValueChange={(v) => setForm({ ...form, role_id: parseInt(v) })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('role_label')} />
                  </SelectTrigger>
                  <SelectContent>
                    {(rolesData || []).map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>{t(r.name)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending}>
                {t('create_user')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

      <div className="flex items-center gap-4 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('search_users')}
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
      </div>

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
          </div>
          {data && data.total > 20 && (
            <div className="flex items-center justify-between p-3 border-t">
              <span className="text-sm text-muted-foreground">
                {page * 20 + 1}–{Math.min((page + 1) * 20, data.total)} of {data.total}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Button>
                <Button variant="outline" size="sm" disabled={(page + 1) * 20 >= data.total} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {editUser && (
        <Dialog open={!!editUser} onOpenChange={(open) => { if (!open) setEditUser(null); }}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">{t('edit_user')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input placeholder={tc('email_label')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder={t('phone_placeholder')} className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                <Input placeholder={tc('first_name_label')} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder={tc('last_name_label')} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                <Input placeholder={tc('middle_name_label')} value={form.middle_name} onChange={(e) => setForm({ ...form, middle_name: e.target.value })} />
              </div>
              <Input placeholder={tc('password_label')} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">{t('role_label')}</label>
                <Select value={String(form.role_id)} onValueChange={(v) => setForm({ ...form, role_id: parseInt(v) })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('role_label')} />
                  </SelectTrigger>
                  <SelectContent>
                    {(rolesData || []).map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>{t(r.name)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="is_active" checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked === true })} />
                <label htmlFor="is_active" className="cursor-pointer">{t('is_active_label')}</label>
              </div>
              <Button className="w-full" onClick={() => updateMutation.mutate({ id: editUser.id, payload: form })} disabled={updateMutation.isPending}>
                {t('edit_user')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <DialogTitle>{t('users_delete_confirm_title')}</DialogTitle>
                <DialogDescription>{t('users_delete_confirm_message')}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {deleteTarget && (
            <div className="rounded-lg bg-muted p-3 text-sm min-w-0 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate min-w-0">{deleteTarget.email}</span>
                <Badge className={`${roleBadgeColors[deleteTarget.role] || 'bg-gray-500 text-white'} border-0 text-sm shrink-0`}>{t(deleteTarget.role)}</Badge>
              </div>
              <p className="text-muted-foreground truncate">{deleteTarget.full_name || '—'}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('cancel')}</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate(deleteTarget!.id)} disabled={deleteMutation.isPending} className="gap-2">
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
