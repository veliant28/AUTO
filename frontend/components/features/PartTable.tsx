'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  getSortedRowModel,
} from '@tanstack/react-table';
import { FixedSizeList as List } from 'react-window';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ShoppingCart, ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';
import PartDetailSheet from './PartDetailSheet';
import { usePartDetail } from '@/hooks/usePartDetail';
import { useCartStore } from '@/store/cartStore';
import { toast } from 'sonner';
import { COLUMN_WIDTHS, VIRTUAL_LIST_HEIGHT, VIRTUAL_ROW_HEIGHT } from '@/lib/constants';

export interface Part {
  id: number;
  article: string;
  name: string;
  brand_id: number;
  tecdoc_id: number | null;
  category_id: number | null;
  price: number | null;
  quantity: number | null;
  supplier_name: string | null;
  currency: string;
}

const columnHelper = createColumnHelper<Part>();

const { ARTICLE, NAME, PRICE, BRAND, STATUS, ACTION } = COLUMN_WIDTHS;

function MobileCard({ part, onDetail, index, t, tc }: { part: Part; onDetail: (p: Part) => void; index: number; t: any; tc: any }) {
  const addItem = useCartStore((s) => s.addItem);
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 10 },
        visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.03, duration: 0.15 } }),
      }}
      initial="hidden"
      animate="visible"
      custom={index}
      className="rounded-lg border bg-card p-4 space-y-2 hover:border-primary/50 transition-colors"
    >
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-muted-foreground">{part.article}</span>
            {part.supplier_name && (
              <Badge variant="outline" className="text-[9px] h-4">{part.supplier_name}</Badge>
            )}
          </div>
          <p className="font-medium text-sm leading-tight line-clamp-2">{part.name}</p>
        </div>
        <div className="text-right shrink-0">
          {part.price ? (
            <p className="font-bold text-base">{part.price.toLocaleString()} {tc('currency')}</p>
          ) : (
            <p className="text-xs text-muted-foreground">{tc('no_price')}</p>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between pt-1">
        <div>
          {part.quantity !== null && part.quantity > 0 ? (
            <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-100 text-[10px] h-5">
              {tc('in_stock')}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px] h-5">{tc('on_order')}</Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => onDetail(part)}>{tc('details')}</Button>
          <Button size="sm" className="h-8 w-8 p-0" onClick={() => {
            addItem({
              id: `cart-${part.id}-${Date.now()}`,
              part_id: part.id,
              article: part.article,
              part_name: part.name,
              quantity: 1,
              price: part.price,
              supplier_name: part.supplier_name,
            });
            toast.success(tc('added_to_cart'));
          }}>
            <ShoppingCart className="w-3.5 h-3.5" />
          </Button>
        </div>
        </div>
      </motion.div>
  );
}

export default function PartTable({ data }: { data: Part[] }) {
  const t = useTranslations('catalog');
  const tc = useTranslations('common');
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const { data: detailData, isLoading: detailLoading } = usePartDetail(selectedPart?.article || null);

  const desktopColumns = useMemo(() => [
    columnHelper.accessor('article', {
      header: t('article'),
      size: ARTICLE,
      cell: (info) => <span className="font-mono font-medium text-xs">{info.getValue()}</span>,
    }),
    columnHelper.accessor('name', {
      header: t('name'),
      size: NAME,
      cell: (info) => <span className="text-sm truncate block max-w-[280px]">{info.getValue()}</span>,
    }),
    columnHelper.accessor('price', {
      header: () => <div className="text-right">{t('price')}</div>,
      size: PRICE,
      cell: (info) => {
        const price = info.getValue();
        return (
          <div className="text-right">
            {price ? (
              <span className="font-semibold">{price.toLocaleString()} {tc('currency')}</span>
            ) : (
              <span className="text-muted-foreground text-xs">—</span>
            )}
          </div>
        );
      },
    }),
    columnHelper.accessor('supplier_name', {
      header: t('brand'),
      size: BRAND,
      cell: (info) => {
        const name = info.getValue();
        return name ? (
          <Badge variant="outline" className="text-[10px]">{name}</Badge>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        );
      },
    }),
    columnHelper.display({
      id: 'status',
      header: t('status'),
      size: STATUS,
      cell: ({ row }) => {
        const qty = row.original.quantity;
        return qty !== null && qty > 0 ? (
          <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-100 text-[10px]">
            {tc('in_stock')}
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">{tc('on_order')}</Badge>
        );
      },
    }),
    columnHelper.display({
      id: 'action',
      header: '',
      size: 100,
      cell: ({ row }) => {
        const part = row.original;
        const addItem = useCartStore.getState().addItem;
        return (
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="text-xs h-8 px-2">{tc('details')}</Button>
            <Button size="sm" className="h-8 w-8 p-0" onClick={() => {
              addItem({
                id: `cart-${part.id}-${Date.now()}`,
                part_id: part.id,
                article: part.article,
                part_name: part.name,
                quantity: 1,
                price: part.price,
                supplier_name: part.supplier_name,
              });
              toast.success(tc('added_to_cart'));
            }}>
              <ShoppingCart className="w-3.5 h-3.5" />
            </Button>
          </div>
        );
      },
    }),
  ], [t, tc]);

  const table = useReactTable({
    data,
    columns: desktopColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const { rows } = table.getRowModel();

  const DesktopRow = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const row = rows[index];
    const part = row.original;
    return (
      <div
        style={style}
        className="flex border-b last:border-0 items-center hover:bg-muted/50 transition-colors px-4"
      >
        {row.getVisibleCells().map((cell) => {
          const size = (cell.column.columnDef as any).size || 100;
          const CellWrapper = ({ children }: { children: React.ReactNode }) => (
            <div className="flex items-center" style={{ width: size, minWidth: size, maxWidth: size }}>
              {children}
            </div>
          );

          if (cell.column.id === 'action') {
            return (
              <div key={cell.id} className="flex items-center justify-end gap-1" style={{ width: ACTION, minWidth: ACTION }}>
                <Button variant="outline" size="sm" className="text-xs h-8 px-2" onClick={() => setSelectedPart(part)}>
                  {tc('details')}
                </Button>
                <Button size="sm" className="h-8 w-8 p-0" onClick={() => {
                  useCartStore.getState().addItem({
                    id: `cart-${part.id}-${Date.now()}`,
                    part_id: part.id,
                    article: part.article,
                    part_name: part.name,
                    quantity: 1,
                    price: part.price,
                    supplier_name: part.supplier_name,
                  });
            toast.success(tc('added_to_cart'));
                }}>
                  <ShoppingCart className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          }

          return (
            <CellWrapper key={cell.id}>
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </CellWrapper>
          );
        })}
      </div>
    );
  };

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden md:block rounded-md border bg-card">
        <div className="flex bg-muted font-medium text-sm border-b px-4">
          {table.getHeaderGroups().map(headerGroup =>
            headerGroup.headers.map((header) => {
              const size = (header.column.columnDef as any).size || 100;
              return (
                <div
                  key={header.id}
                  className="py-2 truncate"
                  style={{ width: size, minWidth: size, maxWidth: size }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </div>
              );
            })
          )}
        </div>
        <List height={VIRTUAL_LIST_HEIGHT} itemCount={rows.length} itemSize={VIRTUAL_ROW_HEIGHT} width="100%">
          {DesktopRow}
        </List>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {data.map((part, idx) => (
          <MobileCard key={part.id} part={part} onDetail={setSelectedPart} index={idx} t={t} tc={tc} />
        ))}
      </div>

      <PartDetailSheet
        isOpen={!!selectedPart}
        onClose={() => setSelectedPart(null)}
        part={selectedPart}
        data={detailData}
        isLoading={detailLoading}
      />
    </>
  );
}
