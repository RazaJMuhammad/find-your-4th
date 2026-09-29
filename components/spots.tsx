import type { Slot } from "@/lib/game-view";

export function OpenChip({ open, celebrate = false }: { open: number; celebrate?: boolean }) {
  if (open <= 0) return <span className={`chip font-semibold ${celebrate ? "chip-locked" : "chip-open"}`}>Locked in</span>;
  if (open === 1) return <span className="chip chip-count chip-last">1 left</span>;
  return <span className="chip chip-count chip-open">{open} left</span>;
}

export function Spots({ slots }: { slots: Slot[] }) {
  const openCount = slots.filter((slot) => slot.status === "open").length;
  return (
    <div className="grid grid-cols-4 gap-2" aria-label="Players">
      {slots.map((slot) => {
        const filled = slot.status !== "open";
        const last = !filled && openCount === 1;
        const label = slot.player?.display_name ?? slot.guest_label ?? (filled ? "Taken" : "Open");
        const tone = filled ? "spot-filled" : last ? "spot-last" : "spot-open";
        return (
          <div key={slot.id} className={`spot ${tone}`}>
            <div className="mono uppercase tracking-wide opacity-80">Spot {slot.slot_index}</div>
            <div className="mt-1 truncate font-semibold">{label}</div>
          </div>
        );
      })}
    </div>
  );
}
