import type {
  CaseDraft,
  ExpectedRelationType,
  GeneratorToggles,
  IdGenerator,
  RelationTypeUI,
  TemplateOption
} from "../models/types";
import {
  buildDoc,
  buildTx,
  joinText,
  applyTogglesToDoc,
  applyTogglesToTx,
  applyInvoiceNoise,
  generateIban,
  applyTxText
} from "../generator/mutators";

function dayIso(offsetDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFrom<T>(values: T[]): T {
  return values[randInt(0, values.length - 1)];
}

function randAmount(base: number, variance: number): number {
  const delta = randInt(-variance, variance);
  return Math.round((base + delta / 100) * 100) / 100;
}

function randBaseAmount(min: number, max: number): number {
  const raw = Math.random() * (max - min) + min;
  return Math.round(raw * 100) / 100;
}

function randInvoice(prefix: string): string {
  return `${prefix}-${randInt(1000, 9999)}`;
}

function randE2E(): string {
  return `E2E-${randInt(1000, 9999)}`;
}

function randVendor(): string {
  const prefixes = ["Nordlicht", "Rheinland", "Bavaria", "Hanse", "Isar", "Elbe", "Spree", "Main", "Vulkan", "Weser"];
  const cores = ["Systems", "Logistics", "Media", "Retail", "Energy", "Office", "Parts", "Consulting", "Labs", "Digital"];
  const suffixes = ["Solutions", "Group", "Services", "Trading", "Works", "Studio", "Holdings", "Partners", "Supply", "Network"];
  const legal = ["GmbH", "AG", "KG", "UG", "GmbH & Co. KG"];
  const cities = ["Hamburg", "Berlin", "Munich", "Cologne", "Frankfurt", "Stuttgart", "Dresden", "Leipzig", "Bremen", "Essen"];

  const prefix = randFrom(prefixes);
  const core = randFrom(cores);
  const suffix = randFrom(suffixes);
  const form = randFrom(legal);
  const city = randFrom(cities);
  return `${prefix} ${core} ${suffix} ${form} ${city}`;
}

function relationToExpected(relationType: RelationTypeUI): ExpectedRelationType {
  switch (relationType) {
    case "doc-only":
    case "tx-only":
      return "none";
    default:
      return relationType;
  }
}

function stripKeywords(text: string): string {
  return text.replace(/\b(teilzahlung|sammelzahlung)\b/gi, "").replace(/\s+/g, " ").trim();
}

function applyInvoiceMismatch(txs: ReturnType<typeof buildTx>[], docs: ReturnType<typeof buildDoc>[]) {
  const invoiceNos = docs.map((doc) => doc.invoice_no).filter(Boolean) as string[];
  if (invoiceNos.length === 0) return txs;
  const mismatch = randInvoice("INV-MIS");
  return txs.map((tx) => {
    if (!tx.reference) return tx;
    const hasInvoice = invoiceNos.some((inv) => tx.reference?.includes(inv));
    if (!hasInvoice) return tx;
    const next = { ...tx, reference: tx.reference.replace(invoiceNos[0], mismatch), ref: mismatch };
    const textRaw = joinText(next.reference, next.description, next.counterparty_name, next.e2e_id);
    return applyTxText(next, textRaw);
  });
}

function parseCaseNumber(caseId: string): number {
  const match = caseId.match(/\d+/);
  const value = match ? Number.parseInt(match[0], 10) : 0;
  return Number.isNaN(value) ? 0 : value;
}

const templateLabels: Record<string, string> = {
  invoice_no_exact_final: "Rechnungsnummer exakt (1:1, final)",
  invoice_no_noise_final: "Rechnungsnummer mit Noise (1:1, final)",
  iban_amount_final: "IBAN + Betrag (1:1, final)",
  e2e_amount_final: "E2E-ID + Betrag (1:1, final)",
  amount_date_vendor_final: "Betrag + Datum + Vendor (1:1, final)",
  blocker_partial_keyword_no_final: "Teilzahlung-Keyword blockt (1:1, no match)",
  ambiguous_two_tx: "Ambiguous: 1 Doc ↔ 2 Tx (1:1)",
  ambiguous_two_docs: "Ambiguous: 2 Docs ↔ 1 Tx (1:1)",
  partial_payment_sum_final: "Teilzahlung Summe passt (1:n, final)",
  partial_payment_wrong_sum_no_match: "Teilzahlung Summe falsch (1:n, no match)",
  batch_payment_sum_final: "Sammelzahlung Summe passt (n:1, final)",
  batch_payment_ambiguous: "Sammelzahlung ambiguous (n:1)",
  split_and_merge_final: "Split & Merge (n:n, final)",
  crossed_refs_final: "Crossed Refs (n:n, final)",
  doc_only_no_tx: "Doc-only (kein Tx)",
  tx_only_no_doc: "Tx-only (kein Doc)"
};

const templateOptions: TemplateOption[] = [
  { id: "invoice_no_exact_final", label: templateLabels.invoice_no_exact_final, relationType: "one_to_one" },
  { id: "invoice_no_noise_final", label: templateLabels.invoice_no_noise_final, relationType: "one_to_one" },
  { id: "iban_amount_final", label: templateLabels.iban_amount_final, relationType: "one_to_one" },
  { id: "e2e_amount_final", label: templateLabels.e2e_amount_final, relationType: "one_to_one" },
  { id: "amount_date_vendor_final", label: templateLabels.amount_date_vendor_final, relationType: "one_to_one" },
  { id: "blocker_partial_keyword_no_final", label: templateLabels.blocker_partial_keyword_no_final, relationType: "one_to_one" },
  { id: "ambiguous_two_tx", label: templateLabels.ambiguous_two_tx, relationType: "one_to_one" },
  { id: "ambiguous_two_docs", label: templateLabels.ambiguous_two_docs, relationType: "one_to_one" },
  { id: "partial_payment_sum_final", label: templateLabels.partial_payment_sum_final, relationType: "one_to_many" },
  { id: "partial_payment_wrong_sum_no_match", label: templateLabels.partial_payment_wrong_sum_no_match, relationType: "one_to_many" },
  { id: "batch_payment_sum_final", label: templateLabels.batch_payment_sum_final, relationType: "many_to_one" },
  { id: "batch_payment_ambiguous", label: templateLabels.batch_payment_ambiguous, relationType: "many_to_one" },
  { id: "split_and_merge_final", label: templateLabels.split_and_merge_final, relationType: "many_to_many" },
  { id: "crossed_refs_final", label: templateLabels.crossed_refs_final, relationType: "many_to_many" },
  { id: "doc_only_no_tx", label: templateLabels.doc_only_no_tx, relationType: "doc-only" },
  { id: "tx_only_no_doc", label: templateLabels.tx_only_no_doc, relationType: "tx-only" }
];

export function getTemplateOptions(relationType: RelationTypeUI): TemplateOption[] {
  return templateOptions.filter((option) => option.relationType === relationType);
}

export function buildCaseFromTemplate(
  relationType: RelationTypeUI,
  templateId: string,
  toggles: GeneratorToggles,
  ids: IdGenerator,
  keepCaseId?: string,
  keepDocIds?: string[],
  keepTxIds?: string[]
): CaseDraft {
  const caseId = keepCaseId ?? ids.nextCaseId();
  const expectedRelation = relationToExpected(relationType);
  const caseOffset = Math.max(1, parseCaseNumber(caseId)) * 1000;
  const offsetAmount = (value: number) => Math.round((value + caseOffset) * 100) / 100;
  const toAmount = (cents: number) => Math.round(cents) / 100;

  let docIndex = 0;
  let txIndex = 0;
  const baseDoc = (partial: Parameters<typeof buildDoc>[0]) => {
    const id = keepDocIds?.[docIndex] ?? ids.nextDocId();
    docIndex += 1;
    return buildDoc({ ...partial, id });
  };
  const baseTx = (partial: Parameters<typeof buildTx>[0]) => {
    const id = keepTxIds?.[txIndex] ?? ids.nextTxId();
    txIndex += 1;
    return buildTx({ ...partial, id });
  };

  let docs = [] as ReturnType<typeof buildDoc>[];
  let txs = [] as ReturnType<typeof buildTx>[];
  let expectedState: CaseDraft["expected_state"] = "FINAL_MATCH";
  let description = templateId.replace(/_/g, " ");
  let templateRequiresIban = false;
  let suppressTxKeywords = false;

  switch (templateId) {
    case "invoice_no_exact_final": {
      const invoiceNo = randInvoice("INV");
      const vendor = randVendor();
      const amount = randBaseAmount(25, 1200);
      const doc = baseDoc({
        amount,
        invoice_no: invoiceNo,
        vendor_raw: vendor,
        invoice_date: dayIso(randInt(-5, -1))
      });
      const tx = baseTx({
        amount,
        reference: `Payment ${invoiceNo}`,
        counterparty_name: vendor,
        booking_date: dayIso(randInt(-4, 0))
      });
      docs = [doc];
      txs = [tx];
      break;
    }
    case "invoice_no_noise_final": {
      const invoiceNo = `${randInt(1000, 9999)}.${randInt(10, 99)}`;
      const vendor = randVendor();
      const amount = randBaseAmount(30, 1500);
      const doc = baseDoc({
        amount,
        invoice_no: invoiceNo,
        vendor_raw: vendor,
        invoice_date: dayIso(randInt(-7, -2))
      });
      const noisy = applyInvoiceNoise(invoiceNo);
      const tx = baseTx({
        amount,
        reference: `Invoice ${noisy}`,
        counterparty_name: vendor,
        booking_date: dayIso(randInt(-6, -1))
      });
      docs = [doc];
      txs = [tx];
      break;
    }
    case "iban_amount_final": {
      const iban = generateIban();
      const vendor = randVendor();
      const amount = randBaseAmount(50, 2500);
      const doc = baseDoc({
        amount,
        invoice_no: randInvoice("INV-IBAN"),
        iban,
        vendor_raw: vendor,
        invoice_date: dayIso(randInt(-6, -2))
      });
      const tx = baseTx({
        amount,
        iban,
        reference: "IBAN match",
        counterparty_name: vendor,
        booking_date: dayIso(randInt(-5, -1))
      });
      templateRequiresIban = true;
      docs = [doc];
      txs = [tx];
      break;
    }
    case "e2e_amount_final": {
      const e2e = randE2E();
      const vendor = randVendor();
      const amount = randBaseAmount(40, 2000);
      const doc = baseDoc({
        amount,
        e2e_id: e2e,
        vendor_raw: vendor,
        invoice_date: dayIso(randInt(-9, -3))
      });
      const tx = baseTx({
        amount,
        e2e_id: e2e,
        reference: "Payment",
        counterparty_name: vendor,
        booking_date: dayIso(randInt(-8, -2))
      });
      docs = [doc];
      txs = [tx];
      break;
    }
    case "amount_date_vendor_final": {
      const vendor = randVendor();
      const amount = randBaseAmount(15, 800);
      const doc = baseDoc({
        amount,
        invoice_no: null,
        vendor_raw: vendor,
        invoice_date: dayIso(randInt(-12, -6))
      });
      const tx = baseTx({
        amount,
        reference: "Monthly service",
        counterparty_name: vendor,
        booking_date: dayIso(randInt(-11, -5))
      });
      docs = [doc];
      txs = [tx];
      break;
    }
    case "blocker_partial_keyword_no_final": {
      const vendor = randVendor();
      const invoiceNo = randInvoice("INV");
      const amount = randBaseAmount(80, 1800);
      const doc = baseDoc({
        amount,
        invoice_no: invoiceNo,
        vendor_raw: vendor,
        invoice_date: dayIso(randInt(-10, -4))
      });
      const tx = baseTx({
        amount,
        reference: `${invoiceNo} Teilzahlung`,
        description: "Teilzahlung",
        counterparty_name: vendor,
        booking_date: dayIso(randInt(-9, -3))
      });
      expectedState = "NO_MATCH";
      docs = [doc];
      txs = [tx];
      break;
    }
    case "ambiguous_two_tx": {
      const vendor = randVendor();
      const invoiceNo = randInvoice("INV-AMB");
      const amount = randBaseAmount(20, 1400);
      const doc = baseDoc({
        amount,
        invoice_no: invoiceNo,
        vendor_raw: vendor,
        invoice_date: dayIso(randInt(-6, -2))
      });
      const tx1 = baseTx({
        amount,
        reference: invoiceNo,
        counterparty_name: vendor,
        booking_date: dayIso(randInt(-5, -1))
      });
      const tx2 = baseTx({
        amount,
        reference: invoiceNo,
        counterparty_name: vendor,
        booking_date: dayIso(randInt(-5, -1))
      });
      expectedState = "AMBIGUOUS";
      docs = [doc];
      txs = [tx1, tx2];
      break;
    }
    case "ambiguous_two_docs": {
      const vendor = randVendor();
      const amount = randBaseAmount(20, 1400);
      const doc1 = baseDoc({
        amount,
        invoice_no: randInvoice("INV-AMB-A"),
        vendor_raw: vendor,
        invoice_date: dayIso(randInt(-6, -2))
      });
      const doc2 = baseDoc({
        amount,
        invoice_no: randInvoice("INV-AMB-B"),
        vendor_raw: vendor,
        invoice_date: dayIso(randInt(-6, -2))
      });
      const tx = baseTx({
        amount,
        reference: "Theta Studio payment",
        counterparty_name: vendor,
        booking_date: dayIso(randInt(-5, -1))
      });
      expectedState = "AMBIGUOUS";
      docs = [doc1, doc2];
      txs = [tx];
      break;
    }
    case "partial_payment_sum_final": {
      const vendor = randVendor();
      const total = offsetAmount(randBaseAmount(20, 800));
      const part1 = Math.round((total * 0.36) * 100) / 100;
      const part2 = Math.round((total - part1) * 100) / 100;
      const invoiceNo = randInvoice("INV-PART");
      const doc = baseDoc({
        amount: total,
        invoice_no: invoiceNo,
        vendor_raw: vendor,
        invoice_date: dayIso(randInt(-14, -8))
      });
      const tx1 = baseTx({
        amount: part1,
        reference: `Teilzahlung 1 ${invoiceNo}`,
        counterparty_name: vendor,
        booking_date: dayIso(randInt(-13, -7))
      });
      const tx2 = baseTx({
        amount: part2,
        reference: `Teilzahlung 2 ${invoiceNo}`,
        counterparty_name: vendor,
        booking_date: dayIso(randInt(-12, -6))
      });
      docs = [doc];
      txs = [tx1, tx2];
      break;
    }
    case "partial_payment_wrong_sum_no_match": {
      const vendor = randVendor();
      const total = offsetAmount(randBaseAmount(20, 800));
      const part1 = Math.round((total * 0.36) * 100) / 100;
      const part2 = Math.round((total - part1 - 0.5) * 100) / 100;
      const invoiceNo = randInvoice("INV-PART");
      const doc = baseDoc({
        amount: total,
        invoice_no: invoiceNo,
        vendor_raw: vendor,
        invoice_date: dayIso(randInt(-14, -8))
      });
      const tx1 = baseTx({
        amount: part1,
        reference: `Teilzahlung 1 ${invoiceNo}`,
        counterparty_name: vendor,
        booking_date: dayIso(randInt(60, 90))
      });
      const tx2 = baseTx({
        amount: part2,
        reference: `Teilzahlung 2 ${invoiceNo}`,
        counterparty_name: vendor,
        booking_date: dayIso(randInt(60, 90))
      });
      expectedState = "NO_MATCH";
      docs = [doc];
      txs = [tx1, tx2];
      break;
    }
    case "batch_payment_sum_final": {
      const vendor = randVendor();
      const doc1Cents = Math.round(offsetAmount(randBaseAmount(10, 600)) * 100);
      const doc2Cents = Math.round(offsetAmount(randBaseAmount(10, 600)) * 100);
      const totalCents = doc1Cents + doc2Cents;
      const doc1Amount = toAmount(doc1Cents);
      const doc2Amount = toAmount(doc2Cents);
      const total = toAmount(totalCents);
      const date = dayIso(randInt(-10, -6));
      const doc1 = baseDoc({
        amount: doc1Amount,
        invoice_no: randInvoice("INV-BP"),
        vendor_raw: vendor,
        invoice_date: date
      });
      const doc2 = baseDoc({
        amount: doc2Amount,
        invoice_no: randInvoice("INV-BP"),
        vendor_raw: vendor,
        invoice_date: date
      });
      const tx = baseTx({
        amount: total,
        reference: `Payment ${vendor}`,
        counterparty_name: vendor,
        booking_date: date
      });
      suppressTxKeywords = true;
      docs = [doc1, doc2];
      txs = [tx];
      break;
    }
    case "batch_payment_ambiguous": {
      const vendor = randVendor();
      const baseCents = Math.round(offsetAmount(randBaseAmount(50, 600)) * 100);
      const doc1Cents = Math.floor(baseCents * 0.4);
      const doc2Cents = baseCents - doc1Cents;
      const doc3Cents = Math.floor(baseCents * 0.5);
      const doc4Cents = baseCents - doc3Cents;
      const doc1Amount = toAmount(doc1Cents);
      const doc2Amount = toAmount(doc2Cents);
      const doc3Amount = toAmount(doc3Cents);
      const doc4Amount = toAmount(doc4Cents);
      const date = dayIso(randInt(-11, -7));
      const doc1 = baseDoc({ amount: doc1Amount, invoice_no: randInvoice("INV-BP-A"), vendor_raw: vendor, invoice_date: date });
      const doc2 = baseDoc({ amount: doc2Amount, invoice_no: randInvoice("INV-BP-A"), vendor_raw: vendor, invoice_date: date });
      const doc3 = baseDoc({ amount: doc3Amount, invoice_no: randInvoice("INV-BP-B"), vendor_raw: vendor, invoice_date: date });
      const doc4 = baseDoc({ amount: doc4Amount, invoice_no: randInvoice("INV-BP-B"), vendor_raw: vendor, invoice_date: date });
      const total = Math.round((doc1Amount + doc2Amount) * 100) / 100;
      const tx = baseTx({
        amount: total,
        reference: `Payment ${vendor}`,
        counterparty_name: vendor,
        booking_date: date
      });
      expectedState = "AMBIGUOUS";
      docs = [doc1, doc2, doc3, doc4];
      txs = [tx];
      break;
    }
    case "split_and_merge_final": {
      const vendor = randVendor();
      const invoiceNo = randInvoice("INV-SM");
      const iban = generateIban();
      const doc1Amount = randBaseAmount(50, 900);
      const doc2Amount = randBaseAmount(50, 900);
      const doc3Amount = randBaseAmount(50, 900);
      const tx1Amount = Math.round((doc1Amount + doc2Amount) * 100) / 100;
      const tx2Amount = doc3Amount;
      const doc1 = baseDoc({ amount: doc1Amount, invoice_no: invoiceNo, iban, vendor_raw: vendor, invoice_date: dayIso(randInt(-8, -4)) });
      const doc2 = baseDoc({ amount: doc2Amount, invoice_no: invoiceNo, iban, vendor_raw: vendor, invoice_date: dayIso(randInt(-8, -4)) });
      const doc3 = baseDoc({ amount: doc3Amount, invoice_no: invoiceNo, iban, vendor_raw: vendor, invoice_date: dayIso(randInt(-8, -4)) });
      const tx1 = baseTx({ amount: tx1Amount, iban, reference: `${vendor} batch`, counterparty_name: vendor, booking_date: dayIso(randInt(-7, -3)) });
      const tx2 = baseTx({ amount: tx2Amount, iban, reference: `${vendor} batch 2`, counterparty_name: vendor, booking_date: dayIso(randInt(-7, -3)) });
      docs = [doc1, doc2, doc3];
      txs = [tx1, tx2];
      break;
    }
    case "crossed_refs_final": {
      const vendor = randVendor();
      const doc1Amount = randBaseAmount(15, 600);
      const doc2Amount = randBaseAmount(15, 600);
      const inv1 = randInvoice("INV-X");
      const inv2 = randInvoice("INV-X");
      const doc1 = baseDoc({ amount: doc1Amount, invoice_no: inv1, vendor_raw: vendor, invoice_date: dayIso(randInt(-8, -4)) });
      const doc2 = baseDoc({ amount: doc2Amount, invoice_no: inv2, vendor_raw: vendor, invoice_date: dayIso(randInt(-8, -4)) });
      const tx1 = baseTx({ amount: doc1Amount, reference: inv2, counterparty_name: vendor, booking_date: dayIso(randInt(-7, -3)) });
      const tx2 = baseTx({ amount: doc2Amount, reference: inv1, counterparty_name: vendor, booking_date: dayIso(randInt(-7, -3)) });
      docs = [doc1, doc2];
      txs = [tx1, tx2];
      break;
    }
    case "doc_only_no_tx": {
      const vendor = randVendor();
      const doc = baseDoc({
        amount: randBaseAmount(15, 600),
        invoice_no: randInvoice("INV-NO-TX"),
        vendor_raw: vendor,
        invoice_date: dayIso(randInt(-4, -1))
      });
      expectedState = "NO_MATCH";
      docs = [doc];
      txs = [];
      break;
    }
    case "tx_only_no_doc": {
      const vendor = randVendor();
      const tx = baseTx({
        amount: randBaseAmount(15, 600),
        reference: "TX ONLY",
        counterparty_name: vendor,
        booking_date: dayIso(randInt(-4, -1))
      });
      expectedState = "NO_MATCH";
      docs = [];
      txs = [tx];
      break;
    }
    default:
      docs = [];
      txs = [];
      break;
  }

  if (templateId === "invoice_no_noise_final" && toggles.invoiceNoNoise && txs[0]) {
    const ref = txs[0].reference ?? "";
    txs[0] = buildTx({ ...txs[0], text_raw: joinText(ref, txs[0].description, txs[0].counterparty_name, txs[0].e2e_id) });
  }

  docs = docs.map((doc) => applyTogglesToDoc(doc, toggles));
  txs = txs.map((tx) => applyTogglesToTx(tx, toggles, templateRequiresIban));
  if (suppressTxKeywords) {
    txs = txs.map((tx) => applyTxText(tx, stripKeywords(tx.text_raw)));
  }
  if (toggles.invoiceNoMismatch) {
    txs = applyInvoiceMismatch(txs, docs);
  }

  if (toggles.invoiceNoNoise && templateId !== "invoice_no_noise_final") {
    txs = txs.map((tx) => {
      if (!tx.reference) {
        return tx;
      }
      const noisy = applyInvoiceNoise(tx.reference);
      return buildTx({ ...tx, reference: noisy, ref: noisy });
    });
  }

  return {
    id: caseId,
    description,
    expected_state: expectedState,
    expected_relation_type: expectedRelation,
    must_reason_codes: [],
    docs,
    txs
  };
}
