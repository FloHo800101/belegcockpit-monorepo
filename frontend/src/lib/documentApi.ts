/**
 * documentApi.ts – Frontend-Anbindung an Supabase Storage + Edge Functions
 *
 * Datenfluss:
 *   uploadDocument()     → Supabase Storage + documents-Tabelle
 *   processDocument()    → process-document Edge Function (Azure DI OCR)
 *   runMatching()        → run-matching Edge Function (Matching Engine)
 *   loadMonthData()      → Echte Transaktions- und Matching-Daten aus DB laden
 *   resolveTransaction() → Mandant-Auflösung in bank_transactions.mandant_resolution schreiben
 */

import { supabase } from './supabase';
import type { MatchingRunResult } from '@beleg-cockpit/shared';
import type { Transaction, Document, TransactionStatus, MandantPackageKey, KanzleiCluster } from '@/data/types';

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, string> = {
  januar: '01', februar: '02', maerz: '03', april: '04',
  mai: '05', juni: '06', juli: '07', august: '08',
  september: '09', oktober: '10', november: '11', dezember: '12',
};

const FRONTEND_MONTH_KEYS = [
  'januar','februar','maerz','april','mai','juni',
  'juli','august','september','oktober','november','dezember',
];

type ExistingDocumentRow = {
  id: string;
  storage_path: string;
};

/** Konvertiert API-Format zurück ins Frontend-Format. Beispiel: `2023-01` → `januar-2023` */
export function toFrontendMonthId(apiMonth: string): string {
  const [year, month] = apiMonth.split('-');
  const key = FRONTEND_MONTH_KEYS[parseInt(month, 10) - 1];
  return key ? `${key}-${year}` : apiMonth;
}

/**
 * Konvertiert das Frontend-Monats-Format in das API-Format.
 * Beispiel: `maerz-2026` → `2026-03`
 */
export function toApiMonthId(frontendId: string): string {
  const parts = frontendId.split('-');
  const year = parts[parts.length - 1];
  const monthKey = parts.slice(0, -1).join('-');
  const month = MONTH_NAMES[monthKey];
  if (!month || !year) throw new Error(`Unbekanntes Monats-Format: ${frontendId}`);
  return `${year}-${month}`;
}

// ── API-Funktionen ────────────────────────────────────────────────────────────

/**
 * Gibt die Tenant-ID des aktuell eingeloggten Users zurück.
 * Liest aus der memberships-Tabelle (SELECT RLS: user_id = auth.uid()).
 */
export async function getMyTenantId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt');

  const { data, error } = await supabase
    .from('memberships')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  if (error || !data?.tenant_id) {
    throw new Error('Tenant nicht gefunden – Registrierung prüfen');
  }
  return data.tenant_id as string;
}

/**
 * Lädt eine Datei in den `documents`-Bucket und legt einen DB-Eintrag an.
 * Pfad-Konvention: `{tenantId}/{docId}/{originalFilename}`
 * Gibt die neue Document-ID zurück.
 */
export async function uploadDocument(
  file: File,
  tenantId: string,
  userId: string,
): Promise<string> {
  const docId = crypto.randomUUID();
  const fileHash = await sha256Hex(file);
  const existing = await findExistingDocumentByHash(tenantId, fileHash);
  if (existing) return existing.id;
  const storagePath = `${tenantId}/${docId}/${file.name}`;

  // 1. In Supabase Storage hochladen
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, file);
  if (uploadError) throw new Error(`Upload fehlgeschlagen: ${uploadError.message}`);

  // 2. Eintrag in documents-Tabelle anlegen
  const { error: insertError } = await supabase
    .from('documents')
    .insert({
      id: docId,
      tenant_id: tenantId,
      uploaded_by: userId,
      storage_bucket: 'documents',
      storage_path: storagePath,
      original_filename: file.name,
      mime_type: file.type || 'application/pdf',
      file_size: file.size,
      file_hash: fileHash,
      status: 'uploaded',
    });
  if (insertError) {
    // Storage-Upload rückgängig machen (best-effort)
    await supabase.storage.from('documents').remove([storagePath]).catch(() => null);
    if (isUniqueViolation(insertError)) {
      const racedExisting = await findExistingDocumentByHash(tenantId, fileHash);
      if (racedExisting) return racedExisting.id;
    }
    throw new Error(`Datenbankfehler: ${insertError.message}`);
  }

  return docId;
}

async function sha256Hex(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

async function findExistingDocumentByHash(
  tenantId: string,
  fileHash: string,
): Promise<ExistingDocumentRow | null> {
  const { data, error } = await (supabase.from('documents') as any)
    .select('id, storage_path')
    .eq('tenant_id', tenantId)
    .eq('file_hash', fileHash)
    .limit(1);
  if (error) throw new Error(`Dublettenprüfung fehlgeschlagen: ${error.message}`);
  if (!Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as { id?: string; storage_path?: string };
  if (!row.id || !row.storage_path) return null;
  return { id: row.id, storage_path: row.storage_path };
}

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  if (error.code === '23505') return true;
  const message = `${error.message ?? ''}`;
  return /unique/i.test(message) && /file_hash|documents_tenant_file_hash_unique/i.test(message);
}

/**
 * Ruft die `process-document` Edge Function auf (Azure DI OCR + Extraktion).
 * Supabase-JS übergibt den JWT des eingeloggten Users automatisch.
 */
export async function processDocument(documentId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('process-document', {
    body: { documentId },
  });
  if (error) {
    // FunctionsHttpError enthält den Response-Body in error.context
    let detail = error.message;
    try {
      const body = await (error as any).context?.json?.();
      if (body?.error) detail = body.error;
    } catch { /* Body bereits konsumiert oder kein JSON */ }
    throw new Error(`OCR-Verarbeitung fehlgeschlagen: ${detail}`);
  }
}

/**
 * Führt das automatische Matching für einen Mandanten-Monat aus.
 * Gibt das MatchingRunResult mit finalMatches, suggestedMatches etc. zurück.
 */
export async function runMatching(
  tenantId: string,
  monthId: string,
): Promise<MatchingRunResult> {
  const { data, error } = await supabase.functions.invoke('run-matching', {
    body: { tenantId, monthId },
  });
  if (error) throw new Error(`Matching fehlgeschlagen: ${error.message}`);
  return data as MatchingRunResult;
}

/**
 * Lädt alle Transaktionen + Matching-Ergebnisse für einen Monat aus der DB.
 * Wird nach runMatching() aufgerufen um den belegStore mit echten Daten zu befüllen.
 *
 * @param tenantId  UUID des Mandanten
 * @param monthId   Frontend-Format, z. B. `januar-2023`
 */
export async function loadMonthData(
  tenantId: string,
  monthId: string,
): Promise<{ transactions: Transaction[]; documents: Document[] }> {
  const apiMonth = toApiMonthId(monthId); // z.B. "2023-01"
  const [year, month] = apiMonth.split('-').map(Number);
  const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  const startDate = `${apiMonth}-01`;

  // 1. Transaktionen für den Monat
  const { data: txRows, error: txError } = await supabase
    .from('bank_transactions')
    .select('id, value_date, amount, currency, counterparty_name, reference, link_state, mandant_resolution')
    .eq('tenant_id', tenantId)
    .gte('value_date', startDate)
    .lt('value_date', `${nextMonth}-01`)
    .order('value_date', { ascending: false });
  if (txError) throw new Error(`Transaktionen laden fehlgeschlagen: ${txError.message}`);
  if (!txRows?.length) return { transactions: [], documents: [] };

  const txIds = txRows.map((t: any) => t.id);

  // 2. Match-Edges: Transaktion → match_group_id
  const { data: txEdges } = await supabase
    .from('match_edges_txs')
    .select('tx_id, match_group_id')
    .eq('tenant_id', tenantId)
    .in('tx_id', txIds);

  const groupIds = [...new Set((txEdges ?? []).map((e: any) => e.match_group_id))];

  // 3 + 4. Match-Edges: match_group_id → doc_id + Konfidenz
  const { data: docEdges } = groupIds.length
    ? await supabase
        .from('match_edges_docs')
        .select('match_group_id, doc_id')
        .eq('tenant_id', tenantId)
        .in('match_group_id', groupIds)
    : { data: [] };

  const { data: groups } = groupIds.length
    ? await supabase
        .from('match_groups')
        .select('id, confidence')
        .eq('tenant_id', tenantId)
        .in('id', groupIds)
    : { data: [] };

  // Lookup-Maps aufbauen
  const txToGroup = new Map<string, string>();
  for (const e of txEdges ?? []) txToGroup.set(e.tx_id, e.match_group_id);

  const groupToDocs = new Map<string, string[]>();
  for (const e of docEdges ?? []) {
    const arr = groupToDocs.get(e.match_group_id) ?? [];
    arr.push(e.doc_id);
    groupToDocs.set(e.match_group_id, arr);
  }

  const groupConfidence = new Map<string, number>();
  for (const g of groups ?? []) groupConfidence.set(g.id, g.confidence ?? 0);

  // 5. Invoices für verknüpfte Dokumente
  const docIds = [...new Set((docEdges ?? []).map((e: any) => e.doc_id))];
  const { data: invoiceRows } = docIds.length
    ? await supabase
        .from('invoices')
        .select('id, vendor_name, invoice_date, amount')
        .eq('tenant_id', tenantId)
        .in('id', docIds)
    : { data: [] };

  // ── Mapping: DB-Row → Transaction ────────────────────────────────────────

  const transactions: Transaction[] = txRows.map((tx: any) => {
    const groupId = txToGroup.get(tx.id);
    const confidence = groupId ? (groupConfidence.get(groupId) ?? 0) : 0;
    const candidateDocumentIds = groupId ? (groupToDocs.get(groupId) ?? []) : [];

    const status = deriveStatus(tx.link_state, tx.mandant_resolution);
    const mandantPackageKey = derivePackageKey(status, tx.amount);
    const kanzleiClusterPrimary = deriveKanzleiCluster(mandantPackageKey);

    return {
      id: tx.id,
      date: tx.value_date,
      amount: typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount,
      currency: tx.currency ?? 'EUR',
      merchant: tx.counterparty_name || tx.reference?.slice(0, 40) || 'Unbekannte Buchung',
      paymentMethod: 'Bank',
      status,
      matchConfidence: Math.round(confidence * 100),
      mandantActionPrimary: '',
      mandantPackageKey,
      mandantReasonHint: '',
      kanzleiClusterPrimary,
      kanzleiReasonHint: '',
      candidateDocumentIds,
      purpose: tx.reference ?? undefined,
    };
  });

  // ── Mapping: DB-Row → Document ───────────────────────────────────────────

  const documents: Document[] = (invoiceRows ?? []).map((inv: any) => ({
    id: inv.id,
    supplierName: inv.vendor_name ?? 'Unbekannter Lieferant',
    date: inv.invoice_date ?? '',
    total: typeof inv.amount === 'string' ? parseFloat(inv.amount) : (inv.amount ?? 0),
    vat: 0,
    linkedTransactionId: null,
    quality: 'ok' as const,
  }));

  return { transactions, documents };
}

function deriveStatus(
  linkState: string | null,
  mandantResolution: string | null,
): TransactionStatus {
  if (linkState === 'linked') return 'matched_confident';
  if (linkState === 'partial' || linkState === 'suggested') return 'matched_uncertain';
  if (mandantResolution === 'no_receipt') return 'resolved_no_receipt';
  if (mandantResolution === 'self_receipt') return 'resolved_self_receipt';
  if (mandantResolution === 'private') return 'resolved_private';
  return 'missing_receipt';
}

function derivePackageKey(status: TransactionStatus, amount: number): MandantPackageKey {
  if (status === 'matched_confident' || status.startsWith('resolved')) return 'monthly_invoices';
  if (status === 'matched_uncertain') return 'other_open';
  const abs = Math.abs(amount);
  if (amount > 0) return 'refunds';
  if (abs >= 500) return 'top_amounts';
  if (abs <= 25) return 'small_no_receipt';
  return 'other_open';
}

function deriveKanzleiCluster(packageKey: MandantPackageKey): KanzleiCluster {
  if (packageKey === 'monthly_invoices') return 'fees';
  if (packageKey === 'refunds') return 'refund_reversal';
  return 'missing';
}

/**
 * Schreibt die Mandant-Auflösung in bank_transactions.mandant_resolution.
 * Wird nach Benutzerentscheidungen in ClusterDetail aufgerufen (fire-and-forget).
 *
 * resolution: 'no_receipt' | 'self_receipt' | 'private' | 'refund_confirmed' | null (zurücksetzen)
 */
export async function resolveTransaction(txId: string, resolution: string | null): Promise<void> {
  const { error } = await supabase
    .from('bank_transactions')
    .update({ mandant_resolution: resolution })
    .eq('id', txId);
  if (error) throw new Error(`Auflösung speichern fehlgeschlagen: ${error.message}`);
}

/**
 * Gibt alle Monate zurück, für die Transaktionen in der DB vorhanden sind.
 * Rückgabe: Frontend-Monats-IDs, neueste zuerst, z. B. ['februar-2026', 'januar-2023']
 */
export async function loadProcessedMonths(tenantId: string): Promise<string[]> {
  const { data } = await supabase
    .from('bank_transactions')
    .select('value_date')
    .eq('tenant_id', tenantId)
    .order('value_date', { ascending: false });

  if (!data?.length) return [];

  const monthSet = new Set<string>();
  for (const row of data) {
    monthSet.add((row.value_date as string).slice(0, 7)); // "YYYY-MM"
  }

  return [...monthSet].map(toFrontendMonthId);
}
