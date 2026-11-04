function whatsappDigits(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `27${digits.slice(1)}`;
  else if (digits.length === 9) digits = `27${digits}`;
  return digits;
}

export function whatsappHref(phone: string, text: string) {
  return `https://wa.me/${whatsappDigits(phone)}?text=${encodeURIComponent(text)}`;
}

export function groupContactLines(contacts: { first_name: string; surname: string; phone: string }[]) {
  return contacts
    .map((contact) => {
      const name = `${contact.first_name} ${contact.surname}`.trim() || "Player";
      return `${name} +${whatsappDigits(contact.phone)}`;
    })
    .join("\n");
}
