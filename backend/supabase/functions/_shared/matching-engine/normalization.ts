import { normalizeText, normalizeVendor } from "./normalize.ts";
import type { Tx } from "./types.ts";

export type NormalizedTx = Tx & {
  bookingDate?: string;
  valueDate?: string;
  reference?: string;
  counterpartyName?: string;
  vendorKey?: string;
  privateHint?: boolean | null;
  isRecurringHint?: boolean | null;
};

export function normalizeTx(tx: Tx): NormalizedTx {
  const bookingDate = tx.bookingDate ?? tx.booking_date;
  const valueDate = tx.valueDate ?? tx.value_date;
  const reference = tx.reference ?? tx.ref ?? undefined;
  const counterpartyName =
    tx.counterpartyName ?? tx.counterparty_name ?? tx.vendor_raw ?? undefined;
  const vendorKey =
    tx.vendorKey ??
    tx.vendor_key ??
    tx.vendor_norm ??
    (counterpartyName ? normalizeVendor(counterpartyName) : undefined);

  const textRaw =
    tx.text_raw ??
    [counterpartyName, reference].filter((value) => value && String(value).trim()).join(" ");
  const textNorm = tx.text_norm ?? (textRaw ? normalizeText(textRaw) : undefined);

  return {
    ...tx,
    bookingDate,
    valueDate,
    reference,
    counterpartyName,
    vendorKey,
    privateHint: tx.privateHint ?? tx.private_hint ?? null,
    isRecurringHint: tx.isRecurringHint ?? tx.is_recurring_hint ?? null,
    text_raw: textRaw || tx.text_raw,
    text_norm: textNorm || tx.text_norm,
  };
}
