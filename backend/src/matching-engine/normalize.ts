const VENDOR_SUFFIXES = new Set([
  "gmbh",
  "mbh",
  "ag",
  "kg",
  "gbr",
  "ohg",
  "ug",
  "ltd",
  "limited",
  "inc",
  "corp",
  "co",
  "company",
  "sarl",
  "sa",
  "bv",
  "nv",
  "oy",
  "ab",
  "aps",
  "plc",
  "llc",
  "kgaa",
  "eg",
  "ev",
]);

const VENDOR_STOP_TOKENS = new Set(["the", "and", "und", "of", "fur", "für", "zum", "zur", "bei"]);

const INVOICE_TRIGGERS = [
  "rechnung",
  "rg",
  "re",
  "invoice",
  "inv",
  "beleg",
  "ref",
  "referenz",
  "refer",
];

const KEEP_FOR_INVOICE = new Set(["-", "/", "_"]);

export function normalizeText(input: string | null | undefined): string {
  if (!input) return "";
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return "";
  const normalized = stripDiacritics(trimmed);

  let out = "";
  let prevSpace = false;
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    const isAlnum =
      (ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9");
    if (isAlnum) {
      out += ch;
      prevSpace = false;
    } else if (!prevSpace) {
      out += " ";
      prevSpace = true;
    }
  }

  return out.trim().replace(/\s+/g, " ");
}

export function normalizeVendor(input: string | null | undefined): string {
  const base = normalizeText(input);
  if (!base) return "";

  const tokens = tokenize(base);
  const filtered = tokens.filter((token) => {
    if (VENDOR_SUFFIXES.has(token)) return false;
    if (VENDOR_STOP_TOKENS.has(token)) return false;
    return true;
  });

  return filtered.join(" ").trim();
}

// Conservative extraction: prefer null over false positives.
export function extractInvoiceNo(input: string | null | undefined): string | null {
  if (!input) return null;
  const normalized = normalizeForInvoice(input);
  if (!normalized) return null;

  const tokens = tokenize(normalized);
  const hasTrigger = tokens.some((token) => INVOICE_TRIGGERS.includes(token));
  if (!hasTrigger) return null;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!INVOICE_TRIGGERS.includes(token)) continue;

    let next = tokens[i + 1] ?? "";
    if (next === "nr" || next === "no" || next === "#" || next === ":") {
      next = tokens[i + 2] ?? "";
    }

    const candidate = normalizeInvoiceToken(next);
    if (candidate && isStrongInvoiceToken(candidate)) {
      return candidate;
    }
  }

  // Fallback: accept invoice-like token only if a trigger exists somewhere.
  for (const token of tokens) {
    const candidate = normalizeInvoiceToken(token);
    if (candidate && isWeakInvoiceToken(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function matchInvoiceNoInText(
  invoiceNo: string | null | undefined,
  text: string | null | undefined
): boolean {
  if (!invoiceNo || !text) return false;
  const needle = normalizeInvoiceToken(invoiceNo);
  if (!needle) return false;

  const raw = stripDiacritics(text).toUpperCase();
  if (!raw.trim()) return false;

  if (/^\d+$/.test(needle)) {
    const pattern = new RegExp(`(^|\\D)${needle}(\\D|$)`);
    if (pattern.test(raw)) return true;
  }

  const compactNeedle = needle.replace(/[^A-Z0-9]/g, "");
  if (compactNeedle.length < 4) return false;

  const compactHaystack = raw.replace(/[^A-Z0-9]/g, "");
  return compactHaystack.includes(compactNeedle);
}

export function stripDiacritics(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

export function tokenize(s: string): string[] {
  return s.split(" ").filter(Boolean);
}

function normalizeForInvoice(input: string) {
  const lowered = input.trim().toLowerCase();
  if (!lowered) return "";
  const normalized = stripDiacritics(lowered);

  let out = "";
  let prevSpace = false;
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    const isAlnum =
      (ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9");
    const isKeep = KEEP_FOR_INVOICE.has(ch);

    if (isAlnum || isKeep) {
      out += ch;
      prevSpace = false;
    } else if (!prevSpace) {
      out += " ";
      prevSpace = true;
    }
  }

  return out.trim().replace(/\s+/g, " ");
}

function normalizeInvoiceToken(token: string) {
  if (!token) return null;
  const cleaned = token.replace(/^[-/_]+|[-/_]+$/g, "");
  if (!cleaned) return null;
  return cleaned.toUpperCase();
}

function isStrongInvoiceToken(token: string) {
  if (!/^[A-Z0-9][A-Z0-9/_-]{3,25}$/.test(token)) return false;
  return /[0-9]/.test(token) && !/^[A-Z]+$/.test(token);
}

function isWeakInvoiceToken(token: string) {
  if (token.length < 5 || token.length > 20) return false;
  const digitCount = (token.match(/[0-9]/g) ?? []).length;
  return digitCount >= 2 && /^[A-Z0-9/_-]+$/.test(token);
}

/*
Testhinweise
- normalizeText: diakritika, punctuation, mehrfachspaces
- normalizeVendor: suffix removal ("Müller GmbH" -> "muller")
- extractInvoiceNo: positive + negative, keine false positives
*/
