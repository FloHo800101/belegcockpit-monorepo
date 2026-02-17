export function normalizeText(input: string): string {
  const lowered = input.toLowerCase();
  const withoutDiacritics = lowered.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return withoutDiacritics.replace(/[^a-z0-9]+/g, " ").trim();
}
