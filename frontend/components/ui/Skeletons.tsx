import { Skeleton } from '@/components/ui/skeleton';

export function CatalogSkeleton() {
  return (
    <div className="flex flex-col md:flex-row gap-8">
      <div className="w-full md:w-1/3 space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
      <div className="w-full md:w-2/3 space-y-4">
        <Skeleton className="h-10 w-full" />
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

export function SearchSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-14 w-full" />
      {[...Array(5)].map((_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}

export function GarageSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="space-y-2 p-3 border rounded-lg">
          <div className="flex items-start justify-between gap-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      ))}
    </div>
  );
}

export function OrdersSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-full" />
      {[...Array(rows)].map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
