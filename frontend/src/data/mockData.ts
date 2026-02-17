// BelegCockpit Mock Data with Synthetic Generation
// Exact counts: 300 transactions (170 confident, 30 uncertain, 100 missing)
// Package distribution for missing_receipt: monthly_invoices:42, small_no_receipt:21, top_amounts:5, marketplace_statement:30, other_open:2

import { Transaction, Document, Mandant, ReviewItem, ReviewReason } from './types';
import { generateDeterministicPurpose } from './purposeGenerator';

// Template transactions (23 total including tx021, tx022, tx023)
const transactionTemplates: Transaction[] = [
  {
    id: "tx001",
    date: "2026-01-05",
    amount: -79.99,
    currency: "EUR",
    merchant: "Telekom Deutschland GmbH",
    paymentMethod: "Bank",
    status: "missing_receipt",
    matchConfidence: 10,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "monthly_invoices",
    mandantReasonHint: "Monatsrechnung fehlt (Telekom)",
    kanzleiClusterPrimary: "missing",
    kanzleiReasonHint: "Wiederkehrend, Beleg fehlt → Nachfordern als Paket"
  },
  {
    id: "tx002",
    date: "2026-01-08",
    amount: -49.0,
    currency: "EUR",
    merchant: "Vodafone GmbH",
    paymentMethod: "Bank",
    status: "missing_receipt",
    matchConfidence: 12,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "monthly_invoices",
    mandantReasonHint: "Monatsrechnung fehlt (Vodafone)",
    kanzleiClusterPrimary: "missing",
    kanzleiReasonHint: "Wiederkehrend, Beleg fehlt → Nachfordern als Paket"
  },
  {
    id: "tx003",
    date: "2026-01-10",
    amount: -19.8,
    currency: "EUR",
    merchant: "PARKAUTOMAT PINNEBERG",
    paymentMethod: "Card",
    status: "missing_receipt",
    matchConfidence: 5,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "small_no_receipt",
    mandantReasonHint: "Kleinbetrag – ggf. ohne Beleg",
    kanzleiClusterPrimary: "missing",
    kanzleiReasonHint: "Kleinbetrag → Eigenbeleg/ohne Beleg möglich (Policy abhängig)"
  },
  {
    id: "tx004",
    date: "2026-01-12",
    amount: -6.5,
    currency: "EUR",
    merchant: "CAFE TRINKGELD",
    paymentMethod: "Card",
    status: "missing_receipt",
    matchConfidence: 5,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "small_no_receipt",
    mandantReasonHint: "Kleinbetrag – ggf. Eigenbeleg",
    kanzleiClusterPrimary: "missing",
    kanzleiReasonHint: "Kleinbetrag → Eigenbeleg/ohne Beleg möglich"
  },
  {
    id: "tx005",
    date: "2026-01-15",
    amount: -399.0,
    currency: "EUR",
    merchant: "AMAZON EU SARL",
    paymentMethod: "Card",
    status: "missing_receipt",
    matchConfidence: 15,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "marketplace_statement",
    mandantReasonHint: "Marktplatz/Sammelrechnung erwartet",
    kanzleiClusterPrimary: "many_to_one",
    kanzleiReasonHint: "Many-to-one: Sammelabbuchung → Statement/Sammelbeleg anfordern"
  },
  {
    id: "tx006",
    date: "2026-01-20",
    amount: -129.0,
    currency: "EUR",
    merchant: "AMAZON MARKETPLACE",
    paymentMethod: "Card",
    status: "missing_receipt",
    matchConfidence: 15,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "marketplace_statement",
    mandantReasonHint: "Marktplatz – Beleg fehlt",
    kanzleiClusterPrimary: "missing",
    kanzleiReasonHint: "Fehlender Einzelbeleg – evtl. Teil von Sammelrechnung"
  },
  {
    id: "tx007",
    date: "2026-01-07",
    amount: -1490.0,
    currency: "EUR",
    merchant: "Dell GmbH",
    paymentMethod: "Bank",
    status: "missing_receipt",
    matchConfidence: 10,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "top_amounts",
    mandantReasonHint: "Wichtiger Posten – Beleg fehlt",
    kanzleiClusterPrimary: "anomaly",
    kanzleiReasonHint: "Hoher Betrag + Beleg fehlt → Risk-Queue"
  },
  {
    id: "tx008",
    date: "2026-01-22",
    amount: -890.0,
    currency: "EUR",
    merchant: "BAUHAUS",
    paymentMethod: "Card",
    status: "missing_receipt",
    matchConfidence: 10,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "top_amounts",
    mandantReasonHint: "Wichtiger Posten – Beleg fehlt",
    kanzleiClusterPrimary: "anomaly",
    kanzleiReasonHint: "Hoher Betrag + Beleg fehlt → Risk-Queue"
  },
  {
    id: "tx009",
    date: "2026-01-09",
    amount: -29.99,
    currency: "EUR",
    merchant: "ADOBE *SUBSCRIPTION",
    paymentMethod: "Card",
    status: "matched_uncertain",
    matchConfidence: 62,
    mandantActionPrimary: "confirm_matches",
    mandantPackageKey: "confirm",
    mandantReasonHint: "Bitte kurz bestätigen",
    kanzleiClusterPrimary: "vendor_unknown",
    kanzleiReasonHint: "Alias/Name unklar → Vendor-Mapping",
    candidateDocumentIds: ["doc009"]
  },
  {
    id: "tx010",
    date: "2026-01-18",
    amount: -12.99,
    currency: "EUR",
    merchant: "GOOGLE *STORAGE",
    paymentMethod: "Card",
    status: "matched_uncertain",
    matchConfidence: 58,
    mandantActionPrimary: "confirm_matches",
    mandantPackageKey: "confirm",
    mandantReasonHint: "Beleg gefunden – Zuordnung unsicher",
    kanzleiClusterPrimary: "vendor_unknown",
    kanzleiReasonHint: "Vendor unklar/ähnlich → Bestätigung hilft",
    candidateDocumentIds: ["doc010"]
  },
  {
    id: "tx011",
    date: "2026-01-11",
    amount: -100.0,
    currency: "EUR",
    merchant: "HOTEL HAMBURG",
    paymentMethod: "Card",
    status: "matched_uncertain",
    matchConfidence: 55,
    mandantActionPrimary: "confirm_matches",
    mandantPackageKey: "confirm",
    mandantReasonHint: "Passt Betrag/Datum nicht ganz",
    kanzleiClusterPrimary: "amount_variance",
    kanzleiReasonHint: "Abweichung → prüfen/Guided Match",
    candidateDocumentIds: ["doc011a"]
  },
  {
    id: "tx012",
    date: "2026-01-11",
    amount: -105.0,
    currency: "EUR",
    merchant: "HOTEL HAMBURG",
    paymentMethod: "Card",
    status: "matched_uncertain",
    matchConfidence: 55,
    mandantActionPrimary: "confirm_matches",
    mandantPackageKey: "confirm",
    mandantReasonHint: "Doppelte Buchung möglich",
    kanzleiClusterPrimary: "duplicate_risk",
    kanzleiReasonHint: "Verdacht Duplikat (gleicher Händler/Datum/ähnlich) → Risk",
    candidateDocumentIds: ["doc011a"]
  },
  {
    id: "tx013",
    date: "2026-01-31",
    amount: -59.0,
    currency: "EUR",
    merchant: "STROMVERSORGER ABC",
    paymentMethod: "Bank",
    status: "matched_confident",
    matchConfidence: 92,
    mandantActionPrimary: "none",
    mandantPackageKey: "none",
    mandantReasonHint: "",
    kanzleiClusterPrimary: "timing",
    kanzleiReasonHint: "Wertstellung/Belegdatum im Folgemonat → Timing/In-Transit"
  },
  {
    id: "tx014",
    date: "2026-01-02",
    amount: -59.0,
    currency: "EUR",
    merchant: "STROMVERSORGER ABC",
    paymentMethod: "Bank",
    status: "matched_confident",
    matchConfidence: 92,
    mandantActionPrimary: "none",
    mandantPackageKey: "none",
    mandantReasonHint: "",
    kanzleiClusterPrimary: "timing",
    kanzleiReasonHint: "Gegenstück zum Timing-Beispiel (Vor-/Nachlauf)"
  },
  {
    id: "tx015",
    date: "2026-01-14",
    amount: -9.9,
    currency: "EUR",
    merchant: "BANKGEBUEHR KONTO",
    paymentMethod: "Bank",
    status: "matched_confident",
    matchConfidence: 95,
    mandantActionPrimary: "none",
    mandantPackageKey: "none",
    mandantReasonHint: "",
    kanzleiClusterPrimary: "fees",
    kanzleiReasonHint: "Gebühr → No-Receipt-Expected"
  },
  {
    id: "tx016",
    date: "2026-01-21",
    amount: 29.99,
    currency: "EUR",
    merchant: "ADOBE REFUND",
    paymentMethod: "Card",
    status: "matched_confident",
    matchConfidence: 90,
    mandantActionPrimary: "none",
    mandantPackageKey: "none",
    mandantReasonHint: "",
    kanzleiClusterPrimary: "refund_reversal",
    kanzleiReasonHint: "Refund/Chargeback Paarbildung"
  },
  {
    id: "tx017",
    date: "2026-01-24",
    amount: -238.0,
    currency: "EUR",
    merchant: "PAYPAL *SHOP-XYZ",
    paymentMethod: "PayPal",
    status: "matched_uncertain",
    matchConfidence: 60,
    mandantActionPrimary: "confirm_matches",
    mandantPackageKey: "confirm",
    mandantReasonHint: "PayPal-Zahlung – Belegzuordnung unsicher",
    kanzleiClusterPrimary: "one_to_many",
    kanzleiReasonHint: "Split/Teilkauf möglich (1 Zahlung ↔ mehrere Belege)",
    candidateDocumentIds: []
  },
  {
    id: "tx018",
    date: "2026-01-24",
    amount: -238.0,
    currency: "EUR",
    merchant: "PAYPAL *SHOP-XYZ",
    paymentMethod: "PayPal",
    status: "matched_uncertain",
    matchConfidence: 60,
    mandantActionPrimary: "confirm_matches",
    mandantPackageKey: "confirm",
    mandantReasonHint: "Doppelte PayPal-Buchung möglich",
    kanzleiClusterPrimary: "duplicate_risk",
    kanzleiReasonHint: "Duplikat-Verdacht PayPal",
    candidateDocumentIds: []
  },
  {
    id: "tx019",
    date: "2026-01-16",
    amount: -119.0,
    currency: "EUR",
    merchant: "RESTAURANT BEWIRTUNG",
    paymentMethod: "Card",
    status: "matched_uncertain",
    matchConfidence: 52,
    mandantActionPrimary: "confirm_matches",
    mandantPackageKey: "confirm",
    mandantReasonHint: "Bewirtung: USt/Anlass prüfen",
    kanzleiClusterPrimary: "tax_risk",
    kanzleiReasonHint: "Steuer-/Bewirtungslogik potenziell relevant → Tax-Review",
    candidateDocumentIds: ["doc019"]
  },
  {
    id: "tx020",
    date: "2026-01-27",
    amount: -1200.0,
    currency: "EUR",
    merchant: "PAYMENT PROVIDER SETTLEMENT",
    paymentMethod: "Bank",
    status: "missing_receipt",
    matchConfidence: 50,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "marketplace_statement",
    mandantReasonHint: "Sammelzahlung – bitte Statement/Rechnung",
    kanzleiClusterPrimary: "many_to_one",
    kanzleiReasonHint: "Settlement (Many-to-one) → Statement + Unterbelege"
  },
  // tx021 - other_open (exact as specified)
  {
    id: "tx021",
    date: "2026-01-19",
    amount: -74.90,
    currency: "EUR",
    merchant: "COPYSHOP PINNEBERG",
    paymentMethod: "Card",
    status: "missing_receipt",
    matchConfidence: 8,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "other_open",
    mandantReasonHint: "Beleg fehlt – sonstiger Posten",
    kanzleiClusterPrimary: "missing",
    kanzleiReasonHint: "Sonstiger fehlender Beleg → einzeln nachfordern oder Eigenbeleg prüfen"
  },
  // tx022 - other_open (exact as specified)
  {
    id: "tx022",
    date: "2026-01-26",
    amount: -156.00,
    currency: "EUR",
    merchant: "DB BAHN ONLINE-TICKET",
    paymentMethod: "Card",
    status: "missing_receipt",
    matchConfidence: 8,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "other_open",
    mandantReasonHint: "Beleg fehlt – sonstiger Posten",
    kanzleiClusterPrimary: "missing",
    kanzleiReasonHint: "Sonstiger fehlender Beleg → Beleg anfordern (PDF/E-Mail) oder als privat markieren"
  },
  // tx023 - Microsoft 365 for monthly_invoices (3rd vendor)
  {
    id: "tx023",
    date: "2026-01-06",
    amount: -12.50,
    currency: "EUR",
    merchant: "MICROSOFT 365",
    paymentMethod: "Card",
    status: "missing_receipt",
    matchConfidence: 12,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "monthly_invoices",
    mandantReasonHint: "Monatsrechnung fehlt (Microsoft 365)",
    kanzleiClusterPrimary: "missing",
    kanzleiReasonHint: "Wiederkehrend, Beleg fehlt → Nachfordern als Paket"
  },
  // Refund/Credit transactions (positive amounts)
  {
    id: "tx024",
    date: "2026-01-08",
    amount: 49.99,
    currency: "EUR",
    merchant: "AMAZON RETOURE",
    paymentMethod: "Bank",
    status: "missing_receipt",
    matchConfidence: 85,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "refunds",
    mandantReasonHint: "Erstattung – bitte bestätigen",
    kanzleiClusterPrimary: "refund_reversal",
    kanzleiReasonHint: "Refund/Gutschrift – Zuordnung prüfen"
  },
  {
    id: "tx025",
    date: "2026-01-12",
    amount: 129.00,
    currency: "EUR",
    merchant: "ZALANDO RETOURE",
    paymentMethod: "Bank",
    status: "missing_receipt",
    matchConfidence: 80,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "refunds",
    mandantReasonHint: "Erstattung – bitte bestätigen",
    kanzleiClusterPrimary: "refund_reversal",
    kanzleiReasonHint: "Refund/Gutschrift – Zuordnung prüfen"
  },
  {
    id: "tx026",
    date: "2026-01-15",
    amount: 24.90,
    currency: "EUR",
    merchant: "PAYPAL ERSTATTUNG",
    paymentMethod: "PayPal",
    status: "missing_receipt",
    matchConfidence: 75,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "refunds",
    mandantReasonHint: "Erstattung – bitte bestätigen",
    kanzleiClusterPrimary: "refund_reversal",
    kanzleiReasonHint: "Refund/Gutschrift – Zuordnung prüfen"
  },
  {
    id: "tx027",
    date: "2026-01-19",
    amount: 89.00,
    currency: "EUR",
    merchant: "MEDIAMARKT GUTSCHRIFT",
    paymentMethod: "Card",
    status: "missing_receipt",
    matchConfidence: 82,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "refunds",
    mandantReasonHint: "Erstattung – bitte bestätigen",
    kanzleiClusterPrimary: "refund_reversal",
    kanzleiReasonHint: "Refund/Gutschrift – Zuordnung prüfen"
  },
  {
    id: "tx028",
    date: "2026-01-22",
    amount: 199.00,
    currency: "EUR",
    merchant: "OTTO RETOURE",
    paymentMethod: "Bank",
    status: "missing_receipt",
    matchConfidence: 78,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "refunds",
    mandantReasonHint: "Erstattung – bitte bestätigen",
    kanzleiClusterPrimary: "refund_reversal",
    kanzleiReasonHint: "Refund/Gutschrift – Zuordnung prüfen"
  },
  {
    id: "tx029",
    date: "2026-01-25",
    amount: 15.50,
    currency: "EUR",
    merchant: "DB BAHN ERSTATTUNG",
    paymentMethod: "Bank",
    status: "missing_receipt",
    matchConfidence: 70,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "refunds",
    mandantReasonHint: "Erstattung – bitte bestätigen",
    kanzleiClusterPrimary: "refund_reversal",
    kanzleiReasonHint: "Refund/Gutschrift – Zuordnung prüfen"
  },
  // Subscription/Abo transactions (possible recurring payments)
  {
    id: "tx030",
    date: "2026-01-03",
    amount: -9.99,
    currency: "EUR",
    merchant: "NETFLIX",
    paymentMethod: "Card",
    status: "missing_receipt",
    matchConfidence: 88,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "subscriptions",
    mandantReasonHint: "Mögliches Abo – bitte bestätigen",
    kanzleiClusterPrimary: "missing",
    kanzleiReasonHint: "Wiederkehrend erkannt → Abo-Bestätigung"
  },
  {
    id: "tx031",
    date: "2026-01-05",
    amount: -14.99,
    currency: "EUR",
    merchant: "SPOTIFY AB",
    paymentMethod: "Card",
    status: "missing_receipt",
    matchConfidence: 85,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "subscriptions",
    mandantReasonHint: "Mögliches Abo – bitte bestätigen",
    kanzleiClusterPrimary: "missing",
    kanzleiReasonHint: "Wiederkehrend erkannt → Abo-Bestätigung"
  },
  {
    id: "tx032",
    date: "2026-01-10",
    amount: -11.99,
    currency: "EUR",
    merchant: "AMAZON PRIME",
    paymentMethod: "Card",
    status: "missing_receipt",
    matchConfidence: 90,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "subscriptions",
    mandantReasonHint: "Mögliches Abo – bitte bestätigen",
    kanzleiClusterPrimary: "missing",
    kanzleiReasonHint: "Wiederkehrend erkannt → Abo-Bestätigung"
  },
  {
    id: "tx033",
    date: "2026-01-15",
    amount: -29.00,
    currency: "EUR",
    merchant: "FITNESSSTUDIO MCFIT",
    paymentMethod: "Bank",
    status: "missing_receipt",
    matchConfidence: 82,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "subscriptions",
    mandantReasonHint: "Mögliches Abo – bitte bestätigen",
    kanzleiClusterPrimary: "missing",
    kanzleiReasonHint: "Wiederkehrend erkannt → Abo-Bestätigung"
  },
  {
    id: "tx034",
    date: "2026-01-18",
    amount: -19.99,
    currency: "EUR",
    merchant: "DROPBOX SUBSCRIPTION",
    paymentMethod: "Card",
    status: "missing_receipt",
    matchConfidence: 86,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "subscriptions",
    mandantReasonHint: "Mögliches Abo – bitte bestätigen",
    kanzleiClusterPrimary: "missing",
    kanzleiReasonHint: "Wiederkehrend erkannt → Abo-Bestätigung"
  },
  // Bundle/Sammelzahlung transactions (1:N or N:1 matching)
  {
    id: "tx035",
    date: "2026-01-14",
    amount: -347.50,
    currency: "EUR",
    merchant: "AMAZON MARKETPLACE",
    paymentMethod: "Card",
    status: "missing_receipt",
    matchConfidence: 45,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "bundles",
    mandantReasonHint: "Sammelzahlung – Belege zuordnen",
    kanzleiClusterPrimary: "one_to_many",
    kanzleiReasonHint: "Eine Zahlung → mehrere Belege",
    candidateDocumentIds: ["docBundle01", "docBundle02", "docBundle03"]
  },
  {
    id: "tx036",
    date: "2026-01-20",
    amount: -189.00,
    currency: "EUR",
    merchant: "PAYPAL *SAMMELKAUF",
    paymentMethod: "PayPal",
    status: "missing_receipt",
    matchConfidence: 40,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "bundles",
    mandantReasonHint: "Sammelzahlung – Belege zuordnen",
    kanzleiClusterPrimary: "one_to_many",
    kanzleiReasonHint: "Eine Zahlung → mehrere Belege",
    candidateDocumentIds: ["docBundle04", "docBundle05"]
  },
  {
    id: "tx037",
    date: "2026-01-22",
    amount: -512.80,
    currency: "EUR",
    merchant: "EBAY SAMMELZAHLUNG",
    paymentMethod: "Bank",
    status: "missing_receipt",
    matchConfidence: 42,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "bundles",
    mandantReasonHint: "Sammelzahlung – Belege zuordnen",
    kanzleiClusterPrimary: "one_to_many",
    kanzleiReasonHint: "Eine Zahlung → mehrere Belege",
    candidateDocumentIds: ["docBundle06", "docBundle07", "docBundle08", "docBundle09"]
  },
  {
    id: "tx038",
    date: "2026-01-25",
    amount: -275.00,
    currency: "EUR",
    merchant: "BÜROBEDARF SAMMELRECHNUNG",
    paymentMethod: "Bank",
    status: "missing_receipt",
    matchConfidence: 50,
    mandantActionPrimary: "open_items",
    mandantPackageKey: "bundles",
    mandantReasonHint: "Sammelzahlung – Belege zuordnen",
    kanzleiClusterPrimary: "many_to_one",
    kanzleiReasonHint: "Mehrere Belege → eine Zahlung",
    candidateDocumentIds: ["docBundle10", "docBundle11"]
  }
];

// Document templates
const documentTemplates: Document[] = [
  {
    id: "doc009",
    supplierName: "Adobe Systems",
    date: "2026-01-09",
    total: 29.99,
    vat: 4.79,
    linkedTransactionId: "tx009",
    quality: "ok"
  },
  {
    id: "doc010",
    supplierName: "Google Ireland",
    date: "2026-01-18",
    total: 12.99,
    vat: 2.07,
    linkedTransactionId: "tx010",
    quality: "ok"
  },
  {
    id: "doc011a",
    supplierName: "Hotel Hamburg GmbH",
    date: "2026-01-10",
    total: 105.0,
    vat: 0.0,
    linkedTransactionId: null,
    quality: "ok"
  },
  {
    id: "doc013",
    supplierName: "Stromversorger ABC",
    date: "2026-02-01",
    total: 59.0,
    vat: 9.42,
    linkedTransactionId: "tx013",
    quality: "ok"
  },
  {
    id: "doc019",
    supplierName: "Restaurant Beispiel GmbH",
    date: "2026-01-16",
    total: 119.0,
    vat: 19.0,
    linkedTransactionId: "tx019",
    quality: "ok"
  },
  {
    id: "docBad01",
    supplierName: "Tankstelle HEM",
    date: "2026-01-12",
    total: 54.3,
    vat: 8.66,
    linkedTransactionId: null,
    quality: "bad_photo"
  },
  // Bundle candidate documents
  {
    id: "docBundle01",
    supplierName: "Amazon - Elektronik",
    date: "2026-01-13",
    total: 149.00,
    vat: 23.81,
    linkedTransactionId: null,
    quality: "ok"
  },
  {
    id: "docBundle02",
    supplierName: "Amazon - Bücher",
    date: "2026-01-13",
    total: 89.50,
    vat: 5.85,
    linkedTransactionId: null,
    quality: "ok"
  },
  {
    id: "docBundle03",
    supplierName: "Amazon - Haushalt",
    date: "2026-01-14",
    total: 109.00,
    vat: 17.40,
    linkedTransactionId: null,
    quality: "ok"
  },
  {
    id: "docBundle04",
    supplierName: "PayPal - Shop A",
    date: "2026-01-19",
    total: 99.00,
    vat: 15.81,
    linkedTransactionId: null,
    quality: "ok"
  },
  {
    id: "docBundle05",
    supplierName: "PayPal - Shop B",
    date: "2026-01-20",
    total: 90.00,
    vat: 14.37,
    linkedTransactionId: null,
    quality: "ok"
  },
  {
    id: "docBundle06",
    supplierName: "eBay Verkäufer 1",
    date: "2026-01-21",
    total: 128.00,
    vat: 20.44,
    linkedTransactionId: null,
    quality: "ok"
  },
  {
    id: "docBundle07",
    supplierName: "eBay Verkäufer 2",
    date: "2026-01-21",
    total: 156.80,
    vat: 25.04,
    linkedTransactionId: null,
    quality: "ok"
  },
  {
    id: "docBundle08",
    supplierName: "eBay Verkäufer 3",
    date: "2026-01-22",
    total: 98.00,
    vat: 15.65,
    linkedTransactionId: null,
    quality: "ok"
  },
  {
    id: "docBundle09",
    supplierName: "eBay Verkäufer 4",
    date: "2026-01-22",
    total: 130.00,
    vat: 20.76,
    linkedTransactionId: null,
    quality: "ok"
  },
  {
    id: "docBundle10",
    supplierName: "Bürobedarf Teil 1",
    date: "2026-01-24",
    total: 150.00,
    vat: 23.95,
    linkedTransactionId: null,
    quality: "ok"
  },
  {
    id: "docBundle11",
    supplierName: "Bürobedarf Teil 2",
    date: "2026-01-25",
    total: 125.00,
    vat: 19.96,
    linkedTransactionId: null,
    quality: "ok"
  }
];

// Synthetic generation to reach exact counts
function generateTransactions(): Transaction[] {
  const transactions: Transaction[] = [...transactionTemplates];
  
  // Target counts
  const targetConfident = 170;
  const targetUncertain = 30;
  const targetMissing = 100;
  
  // Target package distribution for missing_receipt
  const packageTargets = {
    monthly_invoices: 42,
    small_no_receipt: 21,
    top_amounts: 5,
    marketplace_statement: 30,
    other_open: 2 // Already exactly 2 from templates (tx021, tx022)
  };
  
  // 3 vendors for monthly_invoices
  const monthlyVendors = ['Telekom Deutschland GmbH', 'Vodafone GmbH', 'MICROSOFT 365'];
  
  // Count existing from templates
  let confidentCount = transactionTemplates.filter(t => t.status === 'matched_confident').length;
  let uncertainCount = transactionTemplates.filter(t => t.status === 'matched_uncertain').length;
  
  const packageCounts = {
    monthly_invoices: transactionTemplates.filter(t => t.mandantPackageKey === 'monthly_invoices').length,
    small_no_receipt: transactionTemplates.filter(t => t.mandantPackageKey === 'small_no_receipt').length,
    top_amounts: transactionTemplates.filter(t => t.mandantPackageKey === 'top_amounts').length,
    marketplace_statement: transactionTemplates.filter(t => t.mandantPackageKey === 'marketplace_statement').length,
    other_open: 2 // Fixed at 2
  };
  
  let txId = 100;
  
  // Generate more matched_confident (need 170 - existing)
  const confidentTemplates = transactionTemplates.filter(t => t.status === 'matched_confident');
  while (confidentCount < targetConfident) {
    const template = confidentTemplates[confidentCount % confidentTemplates.length];
    const dayOffset = Math.floor(confidentCount / 5);
    transactions.push({
      ...template,
      id: `tx${txId++}`,
      date: `2026-01-${String((parseInt(template.date.split('-')[2]) + dayOffset) % 28 + 1).padStart(2, '0')}`,
      amount: template.amount + (confidentCount * 0.01)
    });
    confidentCount++;
  }
  
  // Generate more matched_uncertain (need 30 - existing)
  const uncertainTemplates = transactionTemplates.filter(t => t.status === 'matched_uncertain');
  while (uncertainCount < targetUncertain) {
    const template = uncertainTemplates[uncertainCount % uncertainTemplates.length];
    const dayOffset = Math.floor(uncertainCount / 3);
    const hasCandidateDoc = uncertainCount < 15; // First half has docs, second half empty
    transactions.push({
      ...template,
      id: `tx${txId++}`,
      date: `2026-01-${String((parseInt(template.date.split('-')[2]) + dayOffset) % 28 + 1).padStart(2, '0')}`,
      amount: template.amount + (uncertainCount * 0.02),
      candidateDocumentIds: hasCandidateDoc ? template.candidateDocumentIds : []
    });
    uncertainCount++;
  }
  
  // Generate missing_receipt for each package (NOT including other_open which is fixed at 2)
  // monthly_invoices: distribute across 3 vendors
  while (packageCounts.monthly_invoices < packageTargets.monthly_invoices) {
    const vendorIndex = packageCounts.monthly_invoices % 3;
    const vendor = monthlyVendors[vendorIndex];
    const baseAmount = vendor === 'Telekom Deutschland GmbH' ? -79.99 : vendor === 'Vodafone GmbH' ? -49.0 : -12.50;
    transactions.push({
      id: `tx${txId++}`,
      date: `2026-01-${String((packageCounts.monthly_invoices % 28) + 1).padStart(2, '0')}`,
      amount: baseAmount + (packageCounts.monthly_invoices * 0.01),
      currency: "EUR",
      merchant: vendor,
      paymentMethod: "Bank",
      status: "missing_receipt",
      matchConfidence: 12,
      mandantActionPrimary: "open_items",
      mandantPackageKey: "monthly_invoices",
      mandantReasonHint: `Monatsrechnung fehlt (${vendor.split(' ')[0]})`,
      kanzleiClusterPrimary: "missing",
      kanzleiReasonHint: "Wiederkehrend, Beleg fehlt → Nachfordern als Paket"
    });
    packageCounts.monthly_invoices++;
  }
  
  // small_no_receipt
  const smallMerchants = ['PARKAUTOMAT HAMBURG', 'CAFE ALSTER', 'KIOSK BAHNHOF', 'TRINKGELD RESTAURANT'];
  while (packageCounts.small_no_receipt < packageTargets.small_no_receipt) {
    const merchant = smallMerchants[packageCounts.small_no_receipt % smallMerchants.length];
    transactions.push({
      id: `tx${txId++}`,
      date: `2026-01-${String((packageCounts.small_no_receipt % 28) + 1).padStart(2, '0')}`,
      amount: -(5 + (packageCounts.small_no_receipt * 0.5)),
      currency: "EUR",
      merchant,
      paymentMethod: "Card",
      status: "missing_receipt",
      matchConfidence: 5,
      mandantActionPrimary: "open_items",
      mandantPackageKey: "small_no_receipt",
      mandantReasonHint: "Kleinbetrag – ggf. ohne Beleg",
      kanzleiClusterPrimary: "missing",
      kanzleiReasonHint: "Kleinbetrag → Eigenbeleg/ohne Beleg möglich"
    });
    packageCounts.small_no_receipt++;
  }
  
  // top_amounts
  const topMerchants = ['Dell GmbH', 'BAUHAUS', 'MEDIAMARKT', 'HORNBACH', 'CONRAD'];
  while (packageCounts.top_amounts < packageTargets.top_amounts) {
    const merchant = topMerchants[packageCounts.top_amounts % topMerchants.length];
    transactions.push({
      id: `tx${txId++}`,
      date: `2026-01-${String((packageCounts.top_amounts % 28) + 1).padStart(2, '0')}`,
      amount: -(800 + (packageCounts.top_amounts * 100)),
      currency: "EUR",
      merchant,
      paymentMethod: "Bank",
      status: "missing_receipt",
      matchConfidence: 10,
      mandantActionPrimary: "open_items",
      mandantPackageKey: "top_amounts",
      mandantReasonHint: "Wichtiger Posten – Beleg fehlt",
      kanzleiClusterPrimary: "anomaly",
      kanzleiReasonHint: "Hoher Betrag + Beleg fehlt → Risk-Queue"
    });
    packageCounts.top_amounts++;
  }
  
  // marketplace_statement
  const marketMerchants = ['AMAZON EU SARL', 'AMAZON MARKETPLACE', 'EBAY SETTLEMENT', 'PAYPAL SETTLEMENT'];
  while (packageCounts.marketplace_statement < packageTargets.marketplace_statement) {
    const merchant = marketMerchants[packageCounts.marketplace_statement % marketMerchants.length];
    const isSettlement = merchant.includes('SETTLEMENT');
    transactions.push({
      id: `tx${txId++}`,
      date: `2026-01-${String((packageCounts.marketplace_statement % 28) + 1).padStart(2, '0')}`,
      amount: -(50 + (packageCounts.marketplace_statement * 15)),
      currency: "EUR",
      merchant,
      paymentMethod: isSettlement ? "Bank" : "Card",
      status: "missing_receipt",
      matchConfidence: 15,
      mandantActionPrimary: "open_items",
      mandantPackageKey: "marketplace_statement",
      mandantReasonHint: isSettlement ? "Sammelzahlung – bitte Statement" : "Marktplatz – Beleg fehlt",
      kanzleiClusterPrimary: isSettlement ? "many_to_one" : "missing",
      kanzleiReasonHint: isSettlement ? "Settlement → Statement + Unterbelege" : "Fehlender Einzelbeleg"
    });
    packageCounts.marketplace_statement++;
  }
  
  // Add purpose to ALL transactions
  return transactions.map(tx => ({
    ...tx,
    purpose: generateDeterministicPurpose(tx.id, tx.merchant, tx.paymentMethod, tx.date)
  }));
}

// Generate documents for matched transactions
function generateDocuments(): Document[] {
  const documents: Document[] = [...documentTemplates];
  const transactions = generateTransactions();
  
  // Create documents for matched_confident transactions that don't have docs yet
  const confidentTxs = transactions.filter(t => t.status === 'matched_confident');
  let docId = 100;
  
  confidentTxs.forEach((tx, index) => {
    if (index >= 4) { // Skip first few that already have docs from templates
      documents.push({
        id: `doc${docId++}`,
        supplierName: tx.merchant,
        date: tx.date,
        total: Math.abs(tx.amount),
        vat: Math.abs(tx.amount) * 0.19,
        linkedTransactionId: tx.id,
        quality: "ok"
      });
    }
  });
  
  // Create documents for some matched_uncertain transactions
  const uncertainTxs = transactions.filter(t => t.status === 'matched_uncertain');
  uncertainTxs.forEach((tx, index) => {
    if (tx.candidateDocumentIds && tx.candidateDocumentIds.length > 0) {
      // Document already exists in templates
      return;
    }
    if (index < 10) { // Create docs for first 10 uncertain
      documents.push({
        id: `doc${docId++}`,
        supplierName: tx.merchant.replace('*', ' ').trim(),
        date: tx.date,
        total: Math.abs(tx.amount) + (index % 2 === 0 ? 5 : -5), // Slight variance
        vat: Math.abs(tx.amount) * 0.19,
        linkedTransactionId: tx.id,
        quality: "ok"
      });
    }
  });
  
  // Add a few more bad_photo documents
  documents.push({
    id: "docBad02",
    supplierName: "REWE Supermarkt",
    date: "2026-01-15",
    total: 45.67,
    vat: 7.29,
    linkedTransactionId: null,
    quality: "bad_photo"
  });
  
  return documents;
}

// Mock mandanten for Kanzlei view (consistent with dashboardMockData)
export const mockMandanten: Mandant[] = [
  {
    id: "mueller-gmbh",
    name: "Müller GmbH",
    month: "Januar 2026",
    transactionCount: 300,
    documentCount: 200,
    matchedConfident: 170,
    matchedUncertain: 30,
    missingReceipt: 100,
    hasRiskFlag: true,
    lastActivity: "2026-01-28"
  },
  {
    id: "bau-co-kg",
    name: "Bau & Co KG",
    month: "Januar 2026",
    transactionCount: 250,
    documentCount: 180,
    matchedConfident: 140,
    matchedUncertain: 22,
    missingReceipt: 88,
    hasRiskFlag: true,
    lastActivity: "2026-01-29"
  },
  {
    id: "friseur-koenig",
    name: "Friseur König",
    month: "Januar 2026",
    transactionCount: 80,
    documentCount: 60,
    matchedConfident: 50,
    matchedUncertain: 8,
    missingReceipt: 22,
    hasRiskFlag: false,
    lastActivity: "2026-01-26"
  },
  {
    id: "cafe-schmidt",
    name: "Café Schmidt",
    month: "Januar 2026",
    transactionCount: 120,
    documentCount: 90,
    matchedConfident: 75,
    matchedUncertain: 11,
    missingReceipt: 34,
    hasRiskFlag: true,
    lastActivity: "2026-01-30"
  },
  {
    id: "it-solutions-nord",
    name: "IT Solutions Nord GmbH",
    month: "Januar 2026",
    transactionCount: 65,
    documentCount: 55,
    matchedConfident: 48,
    matchedUncertain: 6,
    missingReceipt: 11,
    hasRiskFlag: true,
    lastActivity: "2026-01-24"
  },
  {
    id: "autohaus-meyer",
    name: "Autohaus Meyer",
    month: "Januar 2026",
    transactionCount: 45,
    documentCount: 40,
    matchedConfident: 38,
    matchedUncertain: 3,
    missingReceipt: 4,
    hasRiskFlag: false,
    lastActivity: "2026-01-27"
  }
];

// Generate review items (only uncertain/deviating matches for quick review)
function generateReviewItems(): ReviewItem[] {
  const reviewItems: ReviewItem[] = [
    {
      id: 'review001',
      transactionId: 'tx009',
      transactionDate: '2026-01-09',
      transactionAmount: -29.99,
      transactionMerchant: 'ADOBE *SUBSCRIPTION',
      transactionPurpose: 'SEPA-LASTSCHRIFT ADOBE *CREATIVE CLOUD INV 67382',
      documentId: 'doc009',
      documentName: 'Adobe Systems',
      documentDate: '2026-01-08',
      documentAmount: 29.99,
      confidence: 62,
      reviewReason: 'low_confidence',
      status: 'pending',
    },
    {
      id: 'review002',
      transactionId: 'tx011',
      transactionDate: '2026-01-11',
      transactionAmount: -100.00,
      transactionMerchant: 'HOTEL HAMBURG',
      transactionPurpose: 'Kartenzahlung Hotel Hamburg 11.01',
      documentId: 'doc011a',
      documentName: 'Hotel Hamburg GmbH',
      documentDate: '2026-01-11',
      documentAmount: 110.00,
      confidence: 55,
      reviewReason: 'amount_deviation',
      deviationDetails: 'Belegbetrag enthält möglicherweise Minibar',
      status: 'pending',
    },
    {
      id: 'review003',
      transactionId: 'tx010',
      transactionDate: '2026-01-18',
      transactionAmount: -12.99,
      transactionMerchant: 'GOOGLE *STORAGE',
      transactionPurpose: 'GOOGLE *STORAGE IRELAND',
      documentId: 'doc010',
      documentName: 'Google Ireland Ltd',
      documentDate: '2026-01-10',
      documentAmount: 12.99,
      confidence: 58,
      reviewReason: 'date_deviation',
      deviationDetails: 'Belegdatum 8 Tage vor Zahlung',
      status: 'pending',
    },
    {
      id: 'review004',
      transactionId: 'tx015',
      transactionDate: '2026-01-14',
      transactionAmount: -9.90,
      transactionMerchant: 'BANKGEBUEHR KONTO',
      transactionPurpose: 'Kontoführungsgebühr Q1/2026',
      documentId: 'docFee001',
      documentName: 'Sparkasse Pinneberg',
      documentDate: '2026-01-14',
      documentAmount: 9.90,
      confidence: 82,
      reviewReason: 'classification',
      deviationDetails: 'Automatisch als Bankgebühr klassifiziert',
      status: 'pending',
    },
    {
      id: 'review005',
      transactionId: 'tx019',
      transactionDate: '2026-01-16',
      transactionAmount: -119.00,
      transactionMerchant: 'RESTAURANT BEWIRTUNG',
      transactionPurpose: 'Kartenzahlung Restaurant zur Post 16.01',
      documentId: 'doc019',
      documentName: 'Restaurant zur Post',
      documentDate: '2026-01-16',
      documentAmount: 119.00,
      confidence: 52,
      reviewReason: 'classification',
      deviationDetails: 'Bewirtungsbeleg – USt-Behandlung prüfen',
      status: 'pending',
    },
    {
      id: 'review006',
      transactionId: 'tx017',
      transactionDate: '2026-01-24',
      transactionAmount: -238.00,
      transactionMerchant: 'PAYPAL *SHOP-XYZ',
      transactionPurpose: 'PayPal *SHOP-XYZ Ref: PP-9K4L...',
      documentId: 'docPaypal001',
      documentName: 'Shop-XYZ Online',
      documentDate: '2026-01-23',
      documentAmount: 198.00,
      confidence: 60,
      reviewReason: 'ambiguous',
      deviationDetails: 'Mehrere mögliche Belege für diese Zahlung',
      status: 'pending',
    },
    {
      id: 'review007',
      transactionId: 'tx012',
      transactionDate: '2026-01-11',
      transactionAmount: -105.00,
      transactionMerchant: 'HOTEL HAMBURG',
      transactionPurpose: 'Kartenzahlung Hotel Hamburg 11.01 RESTAURANT',
      documentId: 'doc011a',
      documentName: 'Hotel Hamburg GmbH',
      documentDate: '2026-01-11',
      documentAmount: 110.00,
      confidence: 55,
      reviewReason: 'ambiguous',
      deviationDetails: 'Gleicher Beleg wie andere Transaktion – Duplikat?',
      status: 'pending',
    },
    {
      id: 'review008',
      transactionId: 'txGen045',
      transactionDate: '2026-01-20',
      transactionAmount: -89.00,
      transactionMerchant: 'CONRAD ELECTRONIC',
      transactionPurpose: 'Kartenzahlung Conrad Electronic Fil. 0812',
      documentId: 'docConrad001',
      documentName: 'Conrad Electronic SE',
      documentDate: '2026-01-18',
      documentAmount: 94.50,
      confidence: 71,
      reviewReason: 'amount_deviation',
      deviationDetails: 'Betrag weicht um 5,50 € ab',
      status: 'pending',
    },
  ];
  
  return reviewItems;
}

// Export generated data
export const initialTransactions = generateTransactions();
export const initialDocuments = generateDocuments();
export const initialReviewItems = generateReviewItems();

// Helper to get document by ID
export function getDocumentById(docId: string): Document | undefined {
  return initialDocuments.find(d => d.id === docId);
}
