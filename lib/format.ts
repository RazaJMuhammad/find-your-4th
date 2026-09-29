const zone = "Africa/Johannesburg";

export function formatWhen(value: string | Date) {
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDay(value: string | Date) {
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

/** datetime-local values are entered as South African time. */
export function fromJohannesburg(local: string) {
  return new Date(`${local}:00+02:00`);
}

export function toJohannesburgInput(value: Date) {
  const parts = new Intl.DateTimeFormat("en-ZA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function percent(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

export function formatZar(cents: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(cents / 100);
}

export function johannesburgHour(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-ZA", {
    timeZone: zone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  return Number(parts.find((part) => part.type === "hour")?.value ?? "0");
}
