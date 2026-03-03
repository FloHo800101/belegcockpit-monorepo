// Quick test for extractCounterpartyName logic
const BOOKING_TYPE_MAP = [
  [/FOLGELASTSCHRIFT|ERSTLASTSCHRIFT|LASTSCHRIFT/i, "direct_debit"],
  [/ONLINE-UEBERWEISUNG|UEBERWEISUNG|DAUERAUFTRAG/i, "transfer"],
  [/GUTSCHRIFT|EINZAHLUNG/i, "transfer"],
  [/ENTGELTABSCHLUSS|ENTGELT|ABSCHLUSS/i, "fee"],
  [/ZINSEN|ZINSABSCHLUSS/i, "interest"],
  [/KARTENZAHLUNG|GIROCARD|GIROSAMMEL/i, "card_payment"],
];
const BOOKING_TYPE_PREFIX = new RegExp(
  "^(" + BOOKING_TYPE_MAP.flatMap(([re]) => re.source.split("|")).join("|") + ")\\s+",
  "i"
);

function extractCounterpartyName(description) {
  const trimmed = description.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(BOOKING_TYPE_PREFIX, "").trim();
  if (cleaned !== trimmed) return cleaned || null;
  const allKeywords = BOOKING_TYPE_MAP.flatMap(([re]) => re.source.split("|"));
  const midPattern = new RegExp(`(?:^|\\s)(${allKeywords.join("|")})\\s+`, "i");
  const midMatch = trimmed.match(midPattern);
  if (midMatch && midMatch.index != null) {
    const keywordStart = midMatch.index + midMatch[0].indexOf(midMatch[1]);
    const afterKeyword = trimmed.slice(keywordStart).replace(BOOKING_TYPE_PREFIX, "").trim();
    if (afterKeyword) return afterKeyword;
  }
  return cleaned || null;
}

const tests = [
  ["Entgelt Hoffmann", "Hoffmann"],
  ["ENTGELTABSCHLUSS", null],
  ["Gutschrift EWE VERTRIEB GmbH", "EWE VERTRIEB GmbH"],
  ["/ K 396572 /2022-20/ v. 31.12.2022 / Referenz: 0061010910 Entgelt Hoffmann", "Hoffmann"],
];

for (const [input, expected] of tests) {
  const result = extractCounterpartyName(input);
  const ok = result === expected ? "OK" : "FAIL";
  console.log(`${ok}: "${input}" → ${JSON.stringify(result)} (expected ${JSON.stringify(expected)})`);
}
