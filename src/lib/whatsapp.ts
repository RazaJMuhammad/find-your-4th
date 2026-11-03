export function whatsappHref(phone: string, text: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `27${digits.slice(1)}`;
  else if (digits.length === 9) digits = `27${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
