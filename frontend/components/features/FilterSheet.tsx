'use client';

import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { SlidersHorizontal, X } from 'lucide-react';

interface FilterState {
  in_stock_only: boolean;
  min_price: string;
  max_price: string;
  sort_by: string;
  sort_order: string;
}

interface FilterSheetProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onClear: () => void;
  activeCount: number;
}

export default function FilterSheet({ filters, onChange, onClear, activeCount }: FilterSheetProps) {
  const update = (patch: Partial<FilterState>) => onChange({ ...filters, ...patch });

  const controls = (
    <div className="space-y-5">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={filters.in_stock_only}
          onChange={(e) => update({ in_stock_only: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <span className="text-sm font-medium">Только в наличии</span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Цена от</Label>
          <Input
            type="number"
            value={filters.min_price}
            onChange={(e) => update({ min_price: e.target.value })}
            placeholder="0 ₴"
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Цена до</Label>
          <Input
            type="number"
            value={filters.max_price}
            onChange={(e) => update({ max_price: e.target.value })}
            placeholder="99999 ₴"
            className="h-9"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Сортировка</Label>
        <select
          value={filters.sort_by}
          onChange={(e) => update({ sort_by: e.target.value })}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">По умолчанию</option>
          <option value="price">По цене</option>
          <option value="name">По названию</option>
        </select>
      </div>

      {filters.sort_by && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Порядок</Label>
          <select
            value={filters.sort_order}
            onChange={(e) => update({ sort_order: e.target.value })}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="asc">По возрастанию</option>
            <option value="desc">По убыванию</option>
          </select>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile: Sheet trigger */}
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <SlidersHorizontal className="w-4 h-4" />
              Фильтры
              {activeCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] text-xs">{activeCount}</Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader className="mb-6">
              <div className="flex items-center justify-between">
                <SheetTitle>Фильтры и сортировка</SheetTitle>
                <Button variant="ghost" size="sm" onClick={onClear} className="text-xs gap-1">
                  <X className="w-3 h-3" /> Сбросить
                </Button>
              </div>
            </SheetHeader>
            {controls}
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: inline panel */}
      <div className="hidden md:block">
        {controls}
      </div>
    </>
  );
}
