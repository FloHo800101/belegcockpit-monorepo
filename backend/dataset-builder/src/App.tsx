import { useEffect, useMemo, useState } from "react";
import type { CaseDraft, DatasetState } from "./models/types";
import { createIdGenerator } from "./generator/ids";
import DatasetOverview from "./ui/DatasetOverview";
import CaseBuilder from "./ui/CaseBuilder";
import { loadState, saveState, clearState } from "./storage/localStorage";
import { buildExport, downloadExport } from "./export/export";
import { parseImport } from "./export/import";
import { buildDoc, buildTx } from "./generator/mutators";

type ViewState =
  | { mode: "overview" }
  | { mode: "builder"; caseItem: CaseDraft; isEdit: boolean };

const defaultToggles = {
  txIbanMissing: true,
  vendorNoise: false,
  invoiceNoNoise: false,
  invoiceNoMismatch: false,
  dateEdge: false,
  dueDateShift: false,
  amountEdge: false,
  partialKeyword: false,
  batchKeyword: false
};

const defaultState: DatasetState = {
  meta: {
    name: "mass_all",
    tenant_id: "t_all",
    schemaVersion: 1
  },
  cases: []
};

function ensureCaseDefaults(state: DatasetState): DatasetState {
  return {
    ...state,
    cases: state.cases.map((caseItem) => ({
      ...caseItem,
      generator_toggles: caseItem.generator_toggles ?? defaultToggles,
      expected_state:
        caseItem.expected_state === ("SUGGESTED" as CaseDraft["expected_state"])
          ? "SUGGESTED_MATCH"
          : caseItem.expected_state
    }))
  };
}

function buildEmptyCase(id: string): CaseDraft {
  return {
    id,
    description: "new case",
    expected_state: "FINAL_MATCH",
    expected_relation_type: "one_to_one",
    must_reason_codes: [],
    docs: [buildDoc({ id: "doc-000" })],
    txs: [buildTx({ id: "tx-000" })]
  };
}

function duplicateCase(caseItem: CaseDraft, state: DatasetState): CaseDraft {
  const idGenerator = createIdGenerator(
    state.cases.flatMap((item) => item.docs),
    state.cases.flatMap((item) => item.txs),
    state.cases
  );
  const newDocs = caseItem.docs.map((doc) => ({ ...doc, id: idGenerator.nextDocId() }));
  const newTxs = caseItem.txs.map((tx) => ({ ...tx, id: idGenerator.nextTxId() }));
  return {
    ...caseItem,
    id: idGenerator.nextCaseId(),
    description: `${caseItem.description} (copy)`,
    docs: newDocs,
    txs: newTxs
  };
}

export default function App() {
  const [dataset, setDataset] = useState<DatasetState>(() => {
    const loaded = loadState();
    return loaded ? ensureCaseDefaults(loaded) : defaultState;
  });
  const [view, setView] = useState<ViewState>({ mode: "overview" });

  useEffect(() => {
    const timeout = setTimeout(() => saveState(dataset), 300);
    return () => clearTimeout(timeout);
  }, [dataset]);

  const allDocs = useMemo(() => dataset.cases.flatMap((caseItem) => caseItem.docs), [dataset.cases]);
  const allTxs = useMemo(() => dataset.cases.flatMap((caseItem) => caseItem.txs), [dataset.cases]);

  return (
    <>
      <header>
        <div className="row">
          <strong>Dataset Builder</strong>
          <span className="muted">Local-only matching dataset creator</span>
        </div>
      </header>

      {view.mode === "overview" && (
        <DatasetOverview
          state={dataset}
          onUpdateMeta={(name, tenantId) =>
            setDataset({ ...dataset, meta: { ...dataset.meta, name, tenant_id: tenantId } })
          }
          onNewCase={() => {
            const idGenerator = createIdGenerator(allDocs, allTxs, dataset.cases);
            const nextCase = buildEmptyCase(idGenerator.nextCaseId());
            nextCase.docs = nextCase.docs.map((doc) => ({ ...doc, id: idGenerator.nextDocId() }));
            nextCase.txs = nextCase.txs.map((tx) => ({ ...tx, id: idGenerator.nextTxId() }));
            setView({ mode: "builder", caseItem: nextCase, isEdit: false });
          }}
          onEditCase={(id) => {
            const caseItem = dataset.cases.find((item) => item.id === id);
            if (!caseItem) {
              return;
            }
            setView({ mode: "builder", caseItem: { ...caseItem, docs: [...caseItem.docs], txs: [...caseItem.txs] }, isEdit: true });
          }}
          onDuplicateCase={(id) => {
            const caseItem = dataset.cases.find((item) => item.id === id);
            if (!caseItem) {
              return;
            }
            const duplicated = duplicateCase(caseItem, dataset);
            setDataset({ ...dataset, cases: [...dataset.cases, duplicated] });
          }}
          onDeleteCase={(id) => {
            if (!confirm("Delete this case?")) {
              return;
            }
            setDataset({ ...dataset, cases: dataset.cases.filter((item) => item.id !== id) });
          }}
          onExport={() => {
            const exportData = buildExport(dataset);
            downloadExport(exportData);
          }}
          onImport={async (file) => {
            const text = await file.text();
            const parsed = parseImport(text);
            if (!parsed) {
              alert("Invalid dataset.json");
              return;
            }
            setDataset(parsed.state);
            if (parsed.warnings.length > 0) {
              alert(parsed.warnings.join("\n"));
            }
          }}
          onReset={() => {
            if (!confirm("Reset dataset and clear local storage?")) {
              return;
            }
            clearState();
            setDataset(defaultState);
          }}
        />
      )}

      {view.mode === "builder" && (
        <CaseBuilder
          initialCase={view.caseItem}
          idGenerator={createIdGenerator(
            [...allDocs, ...view.caseItem.docs],
            [...allTxs, ...view.caseItem.txs],
            [...dataset.cases, view.caseItem]
          )}
          onSave={(caseItem) => {
            if (view.isEdit) {
              setDataset({
                ...dataset,
                cases: dataset.cases.map((item) => (item.id === caseItem.id ? caseItem : item))
              });
            } else {
              setDataset({ ...dataset, cases: [...dataset.cases, caseItem] });
            }
            setView({ mode: "overview" });
          }}
          onCancel={() => setView({ mode: "overview" })}
        />
      )}
    </>
  );
}
