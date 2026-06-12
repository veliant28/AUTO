'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

type CatalogPaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export default function CatalogPagination({ page, pageSize, total, onPageChange }: CatalogPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-4 py-6">
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="gap-1"
      >
        <ChevronLeft className="h-4 w-4" />
        Назад
      </Button>

      <span className="text-sm text-muted-foreground">
        Страница {page} из {totalPages}
      </span>

      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="gap-1"
      >
        Вперед
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
