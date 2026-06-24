'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Drawer, DrawerTrigger, DrawerContent } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { SlidersHorizontal, RotateCcw, ArrowDownAZ } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface FilterState {
  in_stock_only: boolean;
  min_price: string;
  max_price: string;
  sort_by: string;
  sort_order: string;
}

interface CatalogFilterDrawerProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onClear: () => void;
  activeCount: number;
}

export default function CatalogFilterDrawer({ filters, onChange, onClear, activeCount }: CatalogFilterDrawerProps) {
  const t = useTranslations('common');

  const set = (patch: Partial<FilterState>) => onChange({ ...filters, ...patch });

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline" size="lg" className="gap-2">
          <SlidersHorizontal className="w-5 h-5" />
          {t('filters')}
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] text-sm">{activeCount}</Badge>
          )}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md px-5 py-5 space-y-4 overflow-y-auto">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">{t('filters_sort')}</h3>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button variant="destructive" size="icon" className="h-10 w-10" onClick={onClear}>
                  <RotateCcw className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('reset')}</TooltipContent>
            </Tooltip>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">{t('sort_by')}</Label>
            <div className="flex gap-2">
              <Button
                variant={filters.sort_by === '' ? 'default' : 'outline'}
                size="lg"
                className="flex-1 justify-center"
                onClick={() => set({ sort_by: '', sort_order: 'asc' })}
              >
                {t('sort_default')}
              </Button>
              <Button
                variant={filters.sort_by === 'name' ? 'default' : 'outline'}
                size="lg"
                className="flex-1 justify-center"
                onClick={() => set({ sort_by: 'name' })}
              >
                <ArrowDownAZ className="h-5 w-5 shrink-0" />
                {t('sort_by_name')}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">{t('price_from')} — {t('price_to')}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder={`0`}
                value={filters.min_price}
                onChange={(e) => set({ min_price: e.target.value })}
                className="h-10 text-sm"
              />
              <span className="text-muted-foreground shrink-0">—</span>
              <Input
                type="number"
                placeholder={`99999`}
                value={filters.max_price}
                onChange={(e) => set({ max_price: e.target.value })}
                className="h-10 text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={filters.in_stock_only}
              onCheckedChange={(checked) => set({ in_stock_only: checked === true })}
            />
            {t('in_stock_only')}
          </label>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
