const COMBINING_MARKS_REGEX = /[\u0300-\u036f]/g;
const PATH_SEPARATORS_REGEX = /[\\/]+/g;
const DISALLOWED_SEGMENT_CHARS_REGEX = /[^A-Za-z0-9._-]+/g;
const DASH_RUN_REGEX = /-+/g;
const LEADING_OR_TRAILING_DASHES_REGEX = /^-+|-+$/g;

export function sanitizeStorageKeySegment(value: string, fallback = "segment"): string {
  const normalized = (value ?? "")
    .normalize("NFKD")
    .replace(COMBINING_MARKS_REGEX, "")
    .replace(PATH_SEPARATORS_REGEX, "-")
    .replace(DISALLOWED_SEGMENT_CHARS_REGEX, "-")
    .replace(DASH_RUN_REGEX, "-")
    .replace(LEADING_OR_TRAILING_DASHES_REGEX, "");

  return normalized.length > 0 ? normalized : fallback;
}

export function buildSafeStoragePath(parts: string[]): string {
  if (parts.length === 0) {
    return "segment";
  }

  return parts
    .map((part, index) =>
      sanitizeStorageKeySegment(part, index === parts.length - 1 ? "file" : "segment"),
    )
    .join("/");
}

