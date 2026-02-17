import { useMemo, useState } from "react";
import type { CaseDraft, GeneratorToggles, IdGenerator, RelationTypeUI } from "../models/types";
import { buildDoc, buildTx } from "../generator/mutators";
import { getTemplateOptions, buildCaseFromTemplate } from "../templates/templates";
import { DocsEditor, TxsEditor } from "./Editors";

interface CaseBuilderProps {
  initialCase: CaseDraft;
  idGenerator: IdGenerator;
  onSave: (caseItem: CaseDraft) => void;
  onCancel: () => void;
}

function inferRelationType(caseItem: CaseDraft): RelationTypeUI {
  if (caseItem.expected_relation_type === "none") {
    if (caseItem.docs.length > 0 && caseItem.txs.length === 0) {
      return "doc-only";
    }
    if (caseItem.txs.length > 0 && caseItem.docs.length === 0) {
      return "tx-only";
    }
  }
  return caseItem.expected_relation_type as RelationTypeUI;
}

const defaultToggles: GeneratorToggles = {
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

export default function CaseBuilder(props: CaseBuilderProps) {
  const [caseItem, setCaseItem] = useState<CaseDraft>(() => ({
    ...props.initialCase,
    generator_toggles: props.initialCase.generator_toggles ?? defaultToggles
  }));
  const [relationType, setRelationType] = useState<RelationTypeUI>(inferRelationType(props.initialCase));
  const [templateId, setTemplateId] = useState<string>(
    getTemplateOptions(inferRelationType(props.initialCase))[0]?.id ?? "invoice_no_exact_final"
  );
  const [toggles, setToggles] = useState<GeneratorToggles>(
    props.initialCase.generator_toggles ?? defaultToggles
  );
  const [selectedDocId, setSelectedDocId] = useState<string | null>(caseItem.docs[0]?.id ?? null);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(caseItem.txs[0]?.id ?? null);
  const [autoTextMap, setAutoTextMap] = useState<Record<string, boolean>>({});

  const availableTemplates = useMemo(() => getTemplateOptions(relationType), [relationType]);

  const updateCase = (next: CaseDraft) => {
    setCaseItem(next);
    if (!next.docs.find((doc) => doc.id === selectedDocId)) {
      setSelectedDocId(next.docs[0]?.id ?? null);
    }
    if (!next.txs.find((tx) => tx.id === selectedTxId)) {
      setSelectedTxId(next.txs[0]?.id ?? null);
    }
  };

  return (
    <div className="container">
      <section className="panel">
        <div className="row">
          <label>
            Relation Type
            <select
              value={relationType}
              onChange={(event) => {
                const next = event.target.value as RelationTypeUI;
                setRelationType(next);
                updateCase({
                  ...caseItem,
                  expected_relation_type: next === "doc-only" || next === "tx-only" ? "none" : next
                });
                const nextTemplate = getTemplateOptions(next)[0];
                if (nextTemplate) {
                  setTemplateId(nextTemplate.id);
                }
              }}
            >
              <option value="doc-only">doc-only</option>
              <option value="tx-only">tx-only</option>
              <option value="one_to_one">one_to_one</option>
              <option value="one_to_many">one_to_many</option>
              <option value="many_to_one">many_to_one</option>
              <option value="many_to_many">many_to_many</option>
            </select>
          </label>
          <label>
            Template
            <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
              {availableTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.label}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => {
              const generated = buildCaseFromTemplate(
                relationType,
                templateId,
                toggles,
                props.idGenerator,
                caseItem.id,
                caseItem.docs.map((doc) => doc.id),
                caseItem.txs.map((tx) => tx.id)
              );
              updateCase({ ...generated, generator_toggles: toggles });
            }}
          >
            Generate Prefill
          </button>
        </div>
      </section>

      <section className="panel">
        <h3>Generator Toggles</h3>
        <div className="row">
          {Object.entries(toggles).map(([key, value]) => (
            <label key={key}>
              {key}
              <input
                type="checkbox"
                checked={value}
                onChange={(event) => {
                  const next = { ...toggles, [key]: event.target.checked };
                  setToggles(next);
                  updateCase({ ...caseItem, generator_toggles: next });
                }}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="row">
          <label>
            Case ID
            <input value={caseItem.id} readOnly />
          </label>
          <label>
            Description
            <input
              value={caseItem.description}
              onChange={(event) => updateCase({ ...caseItem, description: event.target.value })}
            />
          </label>
          <label>
            Expected State
            <select
              value={caseItem.expected_state}
              onChange={(event) =>
                updateCase({ ...caseItem, expected_state: event.target.value as CaseDraft["expected_state"] })
              }
            >
              <option value="FINAL_MATCH">FINAL_MATCH</option>
              <option value="SUGGESTED_MATCH">SUGGESTED_MATCH</option>
              <option value="NO_MATCH">NO_MATCH</option>
              <option value="AMBIGUOUS">AMBIGUOUS</option>
              <option value="PARTIAL_MATCH">PARTIAL_MATCH</option>
            </select>
          </label>
          <label>
            Expected Relation
            <select
              value={caseItem.expected_relation_type}
              onChange={(event) =>
                updateCase({
                  ...caseItem,
                  expected_relation_type: event.target.value as CaseDraft["expected_relation_type"]
                })
              }
            >
              <option value="one_to_one">one_to_one</option>
              <option value="one_to_many">one_to_many</option>
              <option value="many_to_one">many_to_one</option>
              <option value="many_to_many">many_to_many</option>
              <option value="none">none</option>
            </select>
          </label>
          <label>
            Doc IDs
            <input value={caseItem.docs.map((doc) => doc.id).join(", ")} readOnly />
          </label>
          <label>
            Tx IDs
            <input value={caseItem.txs.map((tx) => tx.id).join(", ")} readOnly />
          </label>
          <label>
            must_reason_codes (comma)
            <input
              value={caseItem.must_reason_codes?.join(", ") ?? ""}
              onChange={(event) =>
                updateCase({
                  ...caseItem,
                  must_reason_codes: event.target.value
                    .split(",")
                    .map((code) => code.trim())
                    .filter(Boolean)
                })
              }
            />
          </label>
        </div>
      </section>

      <DocsEditor
        docs={caseItem.docs}
        selectedId={selectedDocId}
        onSelect={setSelectedDocId}
        onAdd={() => {
          const doc = buildDoc({ id: props.idGenerator.nextDocId() });
          updateCase({ ...caseItem, docs: [...caseItem.docs, doc] });
        }}
        onRemove={(id) => {
          updateCase({ ...caseItem, docs: caseItem.docs.filter((doc) => doc.id !== id) });
        }}
        onUpdate={(next) => {
          updateCase({
            ...caseItem,
            docs: caseItem.docs.map((doc) => (doc.id === next.id ? next : doc))
          });
        }}
      />

      <TxsEditor
        txs={caseItem.txs}
        selectedId={selectedTxId}
        onSelect={setSelectedTxId}
        onAdd={() => {
          const tx = buildTx({ id: props.idGenerator.nextTxId() });
          updateCase({ ...caseItem, txs: [...caseItem.txs, tx] });
        }}
        onRemove={(id) => {
          updateCase({ ...caseItem, txs: caseItem.txs.filter((tx) => tx.id !== id) });
        }}
        onUpdate={(next) => {
          updateCase({
            ...caseItem,
            txs: caseItem.txs.map((tx) => (tx.id === next.id ? next : tx))
          });
        }}
        autoTextMap={autoTextMap}
        onToggleAutoText={(id, value) => setAutoTextMap({ ...autoTextMap, [id]: value })}
      />

      <section className="panel">
        <div className="row">
          <button className="primary" onClick={() => props.onSave({ ...caseItem, generator_toggles: toggles })}>
            Add Case to Dataset
          </button>
          <button onClick={props.onCancel}>Cancel</button>
        </div>
      </section>
    </div>
  );
}
