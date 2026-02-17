export function canonCompact(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function canonId(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}
