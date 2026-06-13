'use client';

import React, { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Car } from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApplicabilityMakes, useApplicabilityModels, useApplicability } from '@/hooks/usePartDetail';
import { APPLICABILITY_LIMIT } from '@/lib/constants';

type Vehicle = {
  mod_id: number;
  brand_name: string;
  model_name: string;
  mod_name: string;
  years: string;
};

interface ApplicabilityTableProps {
  article: string;
  count: number;
}

function ApplicabilityTable({ article, count }: ApplicabilityTableProps) {
  const t = useTranslations('catalog');
  const [makeId, setMakeId] = useState<string>('');
  const [modelId, setModelId] = useState<string>('');
  const [showAll, setShowAll] = useState(false);

  const limit = showAll ? APPLICABILITY_LIMIT : 10;

  const { data: makes } = useApplicabilityMakes(article);
  const { data: models } = useApplicabilityModels(
    article,
    makeId ? Number(makeId) : null,
  );
  const { data: vehiclesData, isLoading } = useApplicability(article, {
    page: 1,
    limit,
    makeId: makeId ? Number(makeId) : null,
    modelId: modelId ? Number(modelId) : null,
  });

  const vehicles = vehiclesData?.vehicles ?? [];

  const columnHelper = createColumnHelper<Vehicle>();

  const columns = useMemo(
    () => [
      columnHelper.accessor('brand_name', {
        header: t('applicability_make'),
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      columnHelper.accessor('model_name', {
        header: t('applicability_model'),
      }),
      columnHelper.accessor('mod_name', {
        header: t('applicability_modification'),
        cell: (info) => info.getValue() || '—',
      }),
      columnHelper.accessor('years', {
        header: t('applicability_years'),
        cell: (info) => info.getValue() || '—',
      }),
    ],
    [t, columnHelper],
  );

  const table = useReactTable({
    data: vehicles,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });

  const handleMakeChange = (value: string) => {
    setMakeId(value);
    setModelId('');
  };

  return (
    <div className="space-y-3">
      <h4 className="font-semibold text-sm flex items-center gap-2">
        <Car className="w-3.5 h-3.5" /> {t('applicability')}
        <span className="text-muted-foreground font-normal">({count})</span>
        {makeId && (
          <Badge className="bg-blue-500 text-white border-0 text-xs">{t('applicability_compatible')}</Badge>
        )}
      </h4>

      {count === 0 ? (
        <p className="text-sm text-muted-foreground py-4">{t('no_applicability')}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <Select value={makeId} onValueChange={handleMakeChange}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t('select_make')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('select_make')}</SelectItem>
                {makes?.map((m: { id: number; name: string }) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={modelId}
              onValueChange={setModelId}
              disabled={!makeId}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t('select_model')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('select_model')}</SelectItem>
                {models?.map((m: { id: number; name: string }) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : vehicles.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{t('no_applicability')}</p>
          ) : (
            <div className="overflow-hidden">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id}>
                      {hg.headers.map((header) => (
                        <TableHead key={header.id}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {!makeId && count > 10 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-1 text-xs"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? t('collapse') : `${t('show_all')} (${count})`}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

export { ApplicabilityTable };
