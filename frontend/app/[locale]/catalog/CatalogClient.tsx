'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useVehicleStore } from '@/store/vehicleStore';
import { useCategories, useParts } from '@/hooks/usePartData';
import VehicleSelector from '@/components/features/VehicleSelector';
import PartTable from '@/components/features/PartTable';
import FilterSheet from '@/components/features/FilterSheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SlidersHorizontal, X } from 'lucide-react';
import { toast } from '@/lib/toast';
import { TableSkeleton, CatalogSkeleton } from '@/components/ui/Skeletons';


export default function CatalogPage() {
  const t = useTranslations('common');
  const { modId } = useVehicleStore();
  const [selectedSecId, setSelectedSecId] = useState<string | null>(null);
  const [showDesktopFilters, setShowDesktopFilters] = useState(false);

  const [filters, setFilters] = useState({ in_stock_only: false, min_price: '', max_price: '', sort_by: '', sort_order: 'asc' });

  const activeFilterCount = [filters.in_stock_only, filters.min_price, filters.max_price, filters.sort_by].filter(Boolean).length;

  const { data: categories, isLoading: loadingCats } = useCategories(modId);
  const { data: parts, isLoading: loadingParts } = useParts(modId, selectedSecId, {
    in_stock_only: filters.in_stock_only || undefined,
    min_price: filters.min_price ? Number(filters.min_price) : undefined,
    max_price: filters.max_price ? Number(filters.max_price) : undefined,
    sort_by: filters.sort_by || undefined,
    sort_order: filters.sort_order,
  });

  const handleSectionChange = (val: string) => { setSelectedSecId(val); };

  const clearFilters = () => setFilters({ in_stock_only: false, min_price: '', max_price: '', sort_by: '', sort_order: 'asc' });

  if (loadingCats && modId) {
    return (
      <div className="container mx-auto py-8 px-4">
        <CatalogSkeleton />
      </div>
    );
  }

  return (
      <div className="container mx-auto py-8 px-4 space-y-8">
      <div className="flex flex-col md:flex-row gap-8 items-start">
        <div className="w-full md:w-1/3 space-y-6">
          <VehicleSelector />
        </div>

        <div className="w-full md:w-2/3 space-y-6">
          {modId ? (
            <>
              <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
                <div className="flex-1 space-y-2">
                  <label className="text-sm font-medium">{t('select_section')}</label>
                  <Select value={selectedSecId || ""} onValueChange={handleSectionChange}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('select_section')} />
                    </SelectTrigger>
                    <SelectContent>
                      {categories?.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedSecId && (
                  <div className="flex items-center gap-2">
                    {/* Mobile filter trigger */}
                    <div className="md:hidden">
                      <FilterSheet filters={filters} onChange={setFilters} onClear={clearFilters} activeCount={activeFilterCount} />
                    </div>
                    {/* Desktop filter toggle */}
                    <Button variant="outline" size="sm" className="hidden md:inline-flex gap-2" onClick={() => setShowDesktopFilters(!showDesktopFilters)}>
                      <SlidersHorizontal className="w-4 h-4" />
                      {t('filters')}
                      {activeFilterCount > 0 && (
                        <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] text-xs">{activeFilterCount}</Badge>
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {selectedSecId && showDesktopFilters && (
                <div className="hidden md:block p-4 rounded-lg border bg-card space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm">{t('filters_sort')}</h4>
                    <Button variant="ghost" size="sm" onClick={() => { clearFilters(); setShowDesktopFilters(false); }} className="text-xs gap-1">
                      <X className="w-3 h-3" /> {t('close')}
                    </Button>
                  </div>
                  <Separator />
                  <FilterSheet filters={filters} onChange={setFilters} onClear={clearFilters} activeCount={activeFilterCount} />
                </div>
              )}

              {selectedSecId ? (
                loadingParts ? (
                  <TableSkeleton rows={6} />
                ) : (
                  <PartTable data={parts || []} />
                )
              ) : (
                <div className="bg-muted/30 border-2 border-dashed rounded-lg h-64 flex items-center justify-center text-muted-foreground">
                  {t('select_category')}
                </div>
              )}
            </>
          ) : (
            <div className="bg-muted/30 border-2 border-dashed rounded-lg h-96 flex items-center justify-center text-center p-8 text-muted-foreground">
              <div>
                <p className="text-lg font-medium">{t('select_car_first')}</p>
                <p className="text-sm">{t('select_car_desc')}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
