'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('common');
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
        <span className="text-sm font-medium">{t('in_stock_only')}</span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t('price_from')}</Label>
          <Input
            type="number"
            value={filters.min_price}
            onChange={(e) => update({ min_price: e.target.value })}
            placeholder={`0 ${t('currency')}`}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t('price_to')}</Label>
          <Input
            type="number"
            value={filters.max_price}
            onChange={(e) => update({ max_price: e.target.value })}
            placeholder={`99999 ${t('currency')}`}
            className="h-9"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{t('sort_by')}</Label>
        <select
          value={filters.sort_by}
          onChange={(e) => update({ sort_by: e.target.value })}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">{t('sort_default')}</option>
          <option value="price">{t('sort_by_price')}</option>
          <option value="name">{t('sort_by_name')}</option>
        </select>
      </div>

      {filters.sort_by && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t('sort_order')}</Label>
          <select
            value={filters.sort_order}
            onChange={(e) => update({ sort_order: e.target.value })}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="asc">{t('sort_asc')}</option>
            <option value="desc">{t('sort_desc')}</option>
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
              {t('filters')}
              {activeCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] text-xs">{activeCount}</Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader className="mb-6">
              <div className="flex items-center justify-between">
                <SheetTitle>{t('filters_sort')}</SheetTitle>
                <Button variant="ghost" size="sm" onClick={onClear} className="text-xs gap-1">
                  <X className="w-3 h-3" /> {t('reset')}
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
