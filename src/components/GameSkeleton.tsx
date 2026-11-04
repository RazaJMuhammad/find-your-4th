export function GameSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-live="polite" aria-label="Opening game">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="skeleton h-8 w-48" />
          <div className="skeleton h-5 w-28" />
          <div className="skeleton h-4 w-40" />
        </div>
        <div className="skeleton h-36 w-28 shrink-0" />
      </div>
      <div className="flex gap-2">
        <div className="skeleton h-8 w-36 rounded-full" />
        <div className="skeleton h-8 w-28 rounded-full" />
      </div>
      <div className="space-y-2">
        <div className="skeleton h-4 w-16" />
        <div className="skeleton h-14 w-full" />
        <div className="skeleton h-14 w-full" />
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border border-line bg-card p-4" aria-hidden="true">
      <div className="skeleton h-5 w-40" />
      <div className="skeleton h-4 w-24" />
      <div className="skeleton h-14 w-full" />
    </div>
  );
}

export function ListSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-label={label}>
      <CardSkeleton />
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}
