'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

type CatalogPaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export default function CatalogPagination({ page, pageSize, total, onPageChange }: CatalogPaginationProps) {
  const t = useTranslations('common');
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-4 py-6">
      <Button
        variant="outline"
        className="h-9 gap-1 text-sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
        {t('prev_page')}
      </Button>

      <span className="text-sm text-muted-foreground tabular-nums">
        {t('page_of', { page, total: totalPages })}
      </span>

      <Button
        variant="outline"
        className="h-9 gap-1 text-sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        {t('next_page')}
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
