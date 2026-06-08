'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Car, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

interface YearItem { year: number }
interface MakeItem { id: number; name: string }
interface ModelItem { id: number; name: string }
interface CarItem { id: number; name: string; year_from: number | null; year_to: number | null; capacity: string; engine: string; fuel: string; power: string }
interface VolumeItem { volume: string }
interface EngineItem { engine: string }

export default function AdminCatalogPage() {
  const { user } = useAuthStore();
  const t = useTranslations('admin');
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);

  const [vehicleType, setVehicleType] = useState('passenger');
  const [year, setYear] = useState<number | null>(null);
  const [makeId, setMakeId] = useState<number | null>(null);
  const [modelId, setModelId] = useState<number | null>(null);
  const [carId, setCarId] = useState<number | null>(null);
  const [volume, setVolume] = useState('');
  const [engine, setEngine] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const hasEngine = vehicleType === 'passenger';

  const { data: yearsData } = useQuery({
    queryKey: ['catalog-years', vehicleType],
    queryFn: async () => {
      const { data } = await api.get('/admin/catalog/years', { params: { type: vehicleType } });
      return data as YearItem[];
    },
    enabled: hydrated && !!user,
  });

  const { data: makesData } = useQuery({
    queryKey: ['catalog-makes', vehicleType, year],
    queryFn: async () => {
      if (year == null) return [];
      const { data } = await api.get('/admin/catalog/makes', { params: { type: vehicleType, year } });
      return data as MakeItem[];
    },
    enabled: hydrated && !!user && year != null,
  });

  const { data: modelsData } = useQuery({
    queryKey: ['catalog-models', vehicleType, year, makeId],
    queryFn: async () => {
      if (year == null || makeId == null) return [];
      const { data } = await api.get('/admin/catalog/models', { params: { type: vehicleType, year, make_id: makeId } });
      return data as ModelItem[];
    },
    enabled: hydrated && !!user && year != null && makeId != null,
  });

  const { data: carsData } = useQuery({
    queryKey: ['catalog-cars', vehicleType, year, modelId],
    queryFn: async () => {
      if (year == null || modelId == null) return [];
      const { data } = await api.get('/admin/catalog/cars', { params: { type: vehicleType, year, model_id: modelId } });
      return data as CarItem[];
    },
    enabled: hydrated && !!user && year != null && modelId != null,
  });

  const { data: volumesData } = useQuery({
    queryKey: ['catalog-volumes', vehicleType, year, modelId],
    queryFn: async () => {
      if (year == null || modelId == null) return [];
      const { data } = await api.get('/admin/catalog/volumes', { params: { year, model_id: modelId } });
      return data as VolumeItem[];
    },
    enabled: hydrated && !!user && hasEngine && year != null && modelId != null,
  });

  const { data: enginesData } = useQuery({
    queryKey: ['catalog-engines', vehicleType, year, modelId, volume],
    queryFn: async () => {
      if (year == null || modelId == null) return [];
      const params: any = { year, model_id: modelId };
      if (volume) params.volume = volume;
      const { data } = await api.get('/admin/catalog/engines', { params });
      return data as EngineItem[];
    },
    enabled: hydrated && !!user && hasEngine && year != null && modelId != null,
  });

  const { data: itemsData } = useQuery({
    queryKey: ['catalog-items', vehicleType, year, makeId, modelId, carId, volume, engine, search, page, pageSize],
    queryFn: async () => {
      const params: any = { type: vehicleType, page, page_size: pageSize };
      if (year != null) params.year = year;
      if (makeId != null) params.make_id = makeId;
      if (modelId != null) params.model_id = modelId;
      if (carId != null) params.car_id = carId;
      if (volume) params.volume = volume;
      if (engine) params.engine = engine;
      if (search) params.search = search;
      const { data } = await api.get('/admin/catalog/items', { params });
      return data;
    },
    enabled: hydrated && !!user && year != null,
  });

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/10">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || user.role !== 'admin') return null;

  const totalPages = itemsData ? Math.ceil(itemsData.total / pageSize) : 0;

  const resetCascade = (level: string) => {
    setPage(1);
    if (level === 'type') { setYear(null); setMakeId(null); setModelId(null); setCarId(null); setVolume(''); setEngine(''); }
    else if (level === 'year') { setMakeId(null); setModelId(null); setCarId(null); setVolume(''); setEngine(''); }
    else if (level === 'make') { setModelId(null); setCarId(null); setVolume(''); setEngine(''); }
    else if (level === 'model') { setCarId(null); setVolume(''); setEngine(''); }
    else if (level === 'car') { setVolume(''); setEngine(''); }
    else if (level === 'volume') { setEngine(''); }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex gap-2 flex-wrap items-end">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t('catalog_search')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
          <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
        <Select value={vehicleType} onValueChange={(v) => { setVehicleType(v); resetCascade('type'); }}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="passenger">Легковые</SelectItem>
            <SelectItem value="commercial">Коммерческие</SelectItem>
            <SelectItem value="motorbike">Мотоциклы</SelectItem>
          </SelectContent>
        </Select>
        <Select value={year != null ? String(year) : ''} onValueChange={(v) => { setYear(Number(v)); resetCascade('year'); }}>
          <SelectTrigger className="w-[100px]"><SelectValue placeholder={t('catalog_year')} /></SelectTrigger>
          <SelectContent>
            {yearsData?.map((y) => (
              <SelectItem key={y.year} value={String(y.year)}>{y.year}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={makeId != null ? String(makeId) : ''} onValueChange={(v) => { setMakeId(Number(v)); resetCascade('make'); }} disabled={year == null}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder={t('catalog_make')} /></SelectTrigger>
          <SelectContent>
            {makesData?.map((m) => (
              <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={modelId != null ? String(modelId) : ''} onValueChange={(v) => { setModelId(Number(v)); resetCascade('model'); }} disabled={makeId == null}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder={t('catalog_model')} /></SelectTrigger>
          <SelectContent>
            {modelsData?.map((m) => (
              <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasEngine && (
          <Select value={volume} onValueChange={(v) => { setVolume(v); resetCascade('volume'); }} disabled={modelId == null}>
            <SelectTrigger className="w-[110px]"><SelectValue placeholder={t('catalog_volume')} /></SelectTrigger>
            <SelectContent>
              {volumesData?.map((v) => (
                <SelectItem key={v.volume} value={v.volume}>{v.volume}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {hasEngine && (
          <Select value={engine} onValueChange={(v) => { setEngine(v); }} disabled={modelId == null}>
            <SelectTrigger className="w-[120px]"><SelectValue placeholder={t('catalog_engine')} /></SelectTrigger>
            <SelectContent>
              {enginesData?.map((e) => (
                <SelectItem key={e.engine} value={e.engine}>{e.engine}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {year == null ? (
            <div className="p-10 text-center text-muted-foreground text-sm">
              Выберите год для отображения каталога
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground w-[100px]">{t('catalog_year')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground w-[140px]">{t('catalog_make')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground w-[360px]">{t('catalog_model')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('catalog_modification')}</th>
                  {hasEngine && <th className="text-center p-3 font-medium text-muted-foreground w-[90px]">{t('catalog_volume')}</th>}
                  {hasEngine && <th className="text-center p-3 font-medium text-muted-foreground w-[120px]">{t('catalog_engine')}</th>}
                  {hasEngine && <th className="text-center p-3 font-medium text-muted-foreground w-[150px]">{t('catalog_power')}</th>}
                </tr>
              </thead>
              <tbody>
                {itemsData?.items?.map((item: any) => (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3 text-xs whitespace-nowrap">{item.year_from != null && item.year_to != null ? `${item.year_from}–${item.year_to}` : item.year_from ?? item.constructioninterval ?? '—'}</td>
                    <td className="p-3 text-xs font-semibold">{item.brand}</td>
                    <td className="p-3 text-xs truncate">{item.model}</td>
                    <td className="p-3 text-xs truncate">{item.modification}</td>
                    {hasEngine && <td className="p-3 text-center text-xs">{item.capacity || '—'}</td>}
                    {hasEngine && <td className="p-3 text-center text-xs font-mono">{item.engine || '—'}</td>}
                    {hasEngine && <td className="p-3 text-center text-xs whitespace-nowrap">{item.power || '—'}</td>}
                  </tr>
                ))}
                {(!itemsData?.items || itemsData.items.length === 0) && (
                  <tr><td colSpan={hasEngine ? 7 : 4} className="p-6 text-center text-muted-foreground text-sm">{t('catalog_empty')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t">
              <span className="text-sm text-muted-foreground">
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, itemsData?.total || 0)} of {itemsData?.total || 0}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('prev_page')}</Button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 7) p = i + 1;
                  else if (page <= 4) p = i + 1;
                  else if (page >= totalPages - 3) p = totalPages - 6 + i;
                  else p = page - 3 + i;
                  return <Button key={p} variant={p === page ? 'default' : 'outline'} size="sm" onClick={() => setPage(p)}>{p}</Button>;
                })}
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>{t('next_page')}</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
