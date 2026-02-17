import { useRef } from "react";
import type { DatasetState } from "../models/types";

interface DatasetOverviewProps {
  state: DatasetState;
  onNewCase: () => void;
  onEditCase: (id: string) => void;
  onDuplicateCase: (id: string) => void;
  onDeleteCase: (id: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onReset: () => void;
  onUpdateMeta: (name: string, tenantId: string) => void;
}

export default function DatasetOverview(props: DatasetOverviewProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { state } = props;

  return (
    <div className="container">
      <section className="panel">
        <div className="row">
          <label>
            Dataset name
            <input
              value={state.meta.name}
              onChange={(event) => props.onUpdateMeta(event.target.value, state.meta.tenant_id)}
            />
          </label>
          <label>
            Tenant
            <input
              value={state.meta.tenant_id}
              onChange={(event) => props.onUpdateMeta(state.meta.name, event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="row">
          <button className="primary" onClick={props.onNewCase}>
            New Case
          </button>
          <button onClick={props.onExport}>Export JSON</button>
          <button
            onClick={() => {
              fileRef.current?.click();
            }}
          >
            Import JSON
          </button>
          <button className="danger" onClick={props.onReset}>
            Reset Dataset
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                props.onImport(file);
              }
              event.currentTarget.value = "";
            }}
          />
        </div>
      </section>

      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Description</th>
              <th>Expected</th>
              <th>Relation</th>
              <th>Docs</th>
              <th>Txs</th>
              <th>Toggles</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {state.cases.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No cases yet. Click New Case to start.
                </td>
              </tr>
            )}
            {state.cases.map((caseItem) => (
              <tr key={caseItem.id}>
                <td>{caseItem.id}</td>
                <td>{caseItem.description}</td>
                <td>{caseItem.expected_state}</td>
                <td>{caseItem.expected_relation_type}</td>
                <td>{caseItem.docs.length}</td>
                <td>{caseItem.txs.length}</td>
                <td className="muted">
                  {caseItem.generator_toggles
                    ? Object.entries(caseItem.generator_toggles)
                        .filter(([, value]) => value)
                        .map(([key]) => key)
                        .join(", ") || "-"
                    : "-"}
                </td>
                <td>
                  <div className="row">
                    <button onClick={() => props.onEditCase(caseItem.id)}>Edit</button>
                    <button onClick={() => props.onDuplicateCase(caseItem.id)}>Duplicate</button>
                    <button className="danger" onClick={() => props.onDeleteCase(caseItem.id)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
