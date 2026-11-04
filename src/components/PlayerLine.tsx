import { formatRating } from "@/lib/format";

export function PlayerLine({
  name,
  role,
  rating,
  roleClassName = "text-muted",
  action,
}: {
  name: string;
  role: string;
  rating: number | null;
  roleClassName?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-card px-3 py-3">
      <span className="min-w-0">
        <span className="block truncate font-semibold">{name}</span>
        <span className={`block text-xs ${roleClassName}`}>{role}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="text-right">
          <span className="block font-semibold tabular-nums">{formatRating(rating)}</span>
          {rating != null ? <span className="block text-xs text-muted">Playtomic</span> : null}
        </span>
        {action}
      </span>
    </div>
  );
}
