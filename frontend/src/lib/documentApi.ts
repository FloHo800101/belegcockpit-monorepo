/**
 * documentApi.ts – Frontend-Anbindung an Supabase Storage + Edge Functions
 *
 * Datenfluss:
 *   uploadDocument()     → Supabase Storage + documents-Tabelle
 *   processDocument()    → process-document Edge Function (Azure DI OCR)
 *   runMatching()        → run-matching Edge Function (Matching Engine)
 */

import { supabase } from './supabase';
import type { MatchingRunResult } from '@beleg-cockpit/shared';

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, string> = {
  januar: '01', februar: '02', maerz: '03', april: '04',
  mai: '05', juni: '06', juli: '07', august: '08',
  september: '09', oktober: '10', november: '11', dezember: '12',
};

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
      status: 'uploaded',
    });
  if (insertError) {
    // Storage-Upload rückgängig machen (best-effort)
    await supabase.storage.from('documents').remove([storagePath]).catch(() => null);
    throw new Error(`Datenbankfehler: ${insertError.message}`);
  }

  return docId;
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
