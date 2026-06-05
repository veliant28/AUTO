'use client';

import React, { useState, useMemo } from 'react';
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
import { ShoppingCart, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/lib/toast';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { ORDER_STATUS_LABELS } from '@/lib/constants';

interface AdminOrder {
  id: number;
  user_id: number;
  status: string;
  total: number;
  full_name: string;
  phone: string | null;
  address: string | null;
  created_at: string;
  items_count: number;
}

const columnHelper = createColumnHelper<AdminOrder>();
const statusKeys = Object.keys(ORDER_STATUS_LABELS);

export default function AdminOrdersPage() {
  const { user } = useAuthStore();
  const t = useTranslations('admin');
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);

  if (!user || !['admin', 'manager', 'operator'].includes(user.role)) {
    return null;
  }

  const { data, isLoading } = useQuery({
    queryKey: ['admin-orders', statusFilter, page],
    queryFn: async () => {
      const params: any = { page: page + 1, page_size: 20 };
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/admin/orders', { params });
      return data as { items: AdminOrder[]; total: number; page: number; page_size: number };
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: number; status: string }) => {
      await api.put(`/admin/orders/${orderId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      toast.success(t('status_updated'));
    },
  });

  const columns = useMemo(() => [
    columnHelper.accessor('id', {
      header: 'ID',
      size: 60,
      cell: (info) => <span className="font-mono">#{info.getValue()}</span>,
    }),
    columnHelper.accessor('full_name', {
      header: 'Customer',
    }),
    columnHelper.accessor('status', {
      header: t('filter_status'),
      cell: (info) => {
        const variant = ORDER_STATUS_LABELS[info.getValue()]?.variant || 'secondary';
        return <Badge variant={variant}>{info.getValue()}</Badge>;
      },
    }),
    columnHelper.accessor('total', {
      header: 'Total',
      cell: (info) => `${Number(info.getValue()).toLocaleString()} ₴`,
    }),
    columnHelper.accessor('items_count', {
      header: 'Items',
      size: 60,
    }),
    columnHelper.accessor('created_at', {
      header: 'Date',
      cell: (info) => new Date(info.getValue()).toLocaleDateString(),
    }),
    columnHelper.display({
      id: 'actions',
      header: t('actions'),
      size: 200,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Select
            value={row.original.status}
            onValueChange={(val) => statusMutation.mutate({ orderId: row.original.id, status: val })}
          >
            <SelectTrigger className="h-8 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusKeys.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Link href={`/orders/${row.original.id}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ExternalLink className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      ),
    }),
  ], [t]);

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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShoppingCart className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">{t('orders_title')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter || 'all'} onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); setPage(0); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t('filter_status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filter_status')}</SelectItem>
              {statusKeys.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
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
    </div>
  );
}
