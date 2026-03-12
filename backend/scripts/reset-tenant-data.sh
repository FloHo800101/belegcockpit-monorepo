#!/usr/bin/env bash
# reset-tenant-data.sh
# Löscht alle Daten eines Tenants in Supabase (oder nur Matching-Daten).
#
# Verwendung:
#   ./scripts/reset-tenant-data.sh <TENANT_ID> [matching|all]
#
# Beispiel (nur Matching zurücksetzen):
#   ./scripts/reset-tenant-data.sh ec990ac9-32f5-4c7f-b67f-f06e33db119e matching
#
# Beispiel (alles löschen - Belege, Transaktionen, Matches):
#   ./scripts/reset-tenant-data.sh ec990ac9-32f5-4c7f-b67f-f06e33db119e all
#
# Voraussetzungen:
#   - SUPABASE_URL gesetzt (z.B. https://svrvdxrwyxiyepukdmrl.supabase.co)
#   - SUPABASE_SERVICE_ROLE_KEY gesetzt (service_role JWT aus Supabase Dashboard)

set -euo pipefail

TENANT_ID="${1:-}"
MODE="${2:-matching}"

if [[ -z "$TENANT_ID" ]]; then
  echo "Fehler: TENANT_ID fehlt."
  echo "Verwendung: $0 <TENANT_ID> [matching|all]"
  exit 1
fi

if [[ -z "${SUPABASE_URL:-}" ]]; then
  echo "Fehler: SUPABASE_URL nicht gesetzt."
  exit 1
fi

if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "Fehler: SUPABASE_SERVICE_ROLE_KEY nicht gesetzt."
  exit 1
fi

BASE_URL="${SUPABASE_URL}/rest/v1"
AUTH_HEADER="Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
APIKEY_HEADER="apikey: ${SUPABASE_SERVICE_ROLE_KEY}"
CONTENT_TYPE="Content-Type: application/json"

call_api() {
  local method="$1"
  local endpoint="$2"
  shift 2
  local response
  response=$(curl -s -X "$method" \
    -H "$AUTH_HEADER" \
    -H "$APIKEY_HEADER" \
    -H "$CONTENT_TYPE" \
    -H "Prefer: return=representation" \
    "$@" \
    "${BASE_URL}${endpoint}")
  echo "$response"
}

echo "=== BelegCockpit Reset Script ==="
echo "Tenant: $TENANT_ID"
echo "Modus:  $MODE"
echo ""

# ── Schritt 1: Matching zurücksetzen ────────────────────────────────────────
echo ">>> Schritt 1: Matching-Daten löschen..."

# matching_audit
DELETED=$(call_api DELETE "/matching_audit?tenant_id=eq.${TENANT_ID}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo "?")
echo "    matching_audit gelöscht: $DELETED"

# matching_suggestions
DELETED=$(call_api DELETE "/matching_suggestions?tenant_id=eq.${TENANT_ID}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo "?")
echo "    matching_suggestions gelöscht: $DELETED"

# matching_runs
DELETED=$(call_api DELETE "/matching_runs?tenant_id=eq.${TENANT_ID}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo "?")
echo "    matching_runs gelöscht: $DELETED"

# match_edges_docs (via match_groups, da kein direkter tenant_id FK)
MATCH_GROUP_IDS=$(call_api GET "/match_groups?tenant_id=eq.${TENANT_ID}&select=id" | python3 -c "import sys,json; d=json.load(sys.stdin); ids=','.join(x['id'] for x in d); print(ids)" 2>/dev/null || echo "")
if [[ -n "$MATCH_GROUP_IDS" ]]; then
  IN_FILTER="in.(${MATCH_GROUP_IDS})"
  DELETED=$(call_api DELETE "/match_edges_docs?match_group_id=${IN_FILTER}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo "?")
  echo "    match_edges_docs gelöscht: $DELETED"
fi

# match_groups
DELETED=$(call_api DELETE "/match_groups?tenant_id=eq.${TENANT_ID}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo "?")
echo "    match_groups gelöscht: $DELETED"

# link_state zurücksetzen: bank_transactions, invoices, documents
call_api PATCH "/bank_transactions?tenant_id=eq.${TENANT_ID}" -d '{"link_state":"unlinked","match_group_id":null,"matched_at":null,"matched_by":null,"match_reason":null}' > /dev/null
echo "    bank_transactions.link_state → unlinked"

call_api PATCH "/invoices?tenant_id=eq.${TENANT_ID}" -d '{"link_state":"unlinked","match_group_id":null,"matched_at":null,"matched_by":null,"match_reason":null}' > /dev/null
echo "    invoices.link_state → unlinked"

call_api PATCH "/documents?tenant_id=eq.${TENANT_ID}" -d '{"link_state":"unlinked"}' > /dev/null
echo "    documents.link_state → unlinked"

echo ""
echo ">>> Matching-Reset abgeschlossen."

# ── Schritt 2: Alle Daten löschen (nur wenn MODE=all) ───────────────────────
if [[ "$MODE" == "all" ]]; then
  echo ""
  echo ">>> Schritt 2: Alle Daten löschen (Transaktionen + Dokumente + Rechnungen)..."

  DELETED=$(call_api DELETE "/bank_transactions?tenant_id=eq.${TENANT_ID}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo "?")
  echo "    bank_transactions gelöscht: $DELETED"

  # documents löschen (cascade → invoices werden automatisch gelöscht)
  DELETED=$(call_api DELETE "/documents?tenant_id=eq.${TENANT_ID}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo "?")
  echo "    documents gelöscht (+ invoices via cascade): $DELETED"

  echo ""
  echo ">>> Vollständiger Reset abgeschlossen. Datenbank ist leer."
else
  echo ""
  echo ">>> Nur Matching zurückgesetzt. Dokumente und Transaktionen bleiben erhalten."
fi

echo ""
echo "=== Done ==="
