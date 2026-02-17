import type { CanonicalDoc, CanonicalTx } from "../models/types";
import { applyDocText, applyDocVendor, applyTxText, applyTxVendor, joinText } from "../generator/mutators";

interface DocsEditorProps {
  docs: CanonicalDoc[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (next: CanonicalDoc) => void;
}

interface TxsEditorProps {
  txs: CanonicalTx[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (next: CanonicalTx) => void;
  autoTextMap: Record<string, boolean>;
  onToggleAutoText: (id: string, value: boolean) => void;
}

export function DocsEditor(props: DocsEditorProps) {
  const doc = props.docs.find((item) => item.id === props.selectedId) ?? props.docs[0];

  return (
    <section className="panel">
      <div className="row">
        <h3>Docs</h3>
        <button onClick={props.onAdd}>Add Doc</button>
        {doc && (
          <button className="danger" onClick={() => props.onRemove(doc.id)}>
            Remove
          </button>
        )}
      </div>
      <div className="split">
        <div className="list">
          {props.docs.map((item) => (
            <button
              key={item.id}
              className={item.id === doc?.id ? "active" : undefined}
              onClick={() => props.onSelect(item.id)}
            >
              {item.id} - {item.invoice_no ?? "no invoice"}
            </button>
          ))}
        </div>
        {doc ? (
          <div className="row">
            <label>
              ID
              <input value={doc.id} readOnly />
            </label>
            <label>
              Amount
              <input
                type="number"
                value={doc.amount}
                onChange={(event) => props.onUpdate({ ...doc, amount: Number(event.target.value) })}
              />
            </label>
            <label>
              Invoice Date
              <input
                type="date"
                value={doc.invoice_date.slice(0, 10)}
                onChange={(event) =>
                  props.onUpdate({
                    ...doc,
                    invoice_date: `${event.target.value}T00:00:00.000Z`
                  })
                }
              />
            </label>
            <label>
              Due Date
              <input
                type="date"
                value={(doc.due_date ?? doc.invoice_date).slice(0, 10)}
                onChange={(event) =>
                  props.onUpdate({
                    ...doc,
                    due_date: `${event.target.value}T00:00:00.000Z`
                  })
                }
              />
            </label>
            <label>
              Invoice No
              <input
                value={doc.invoice_no ?? ""}
                onChange={(event) => props.onUpdate({ ...doc, invoice_no: event.target.value || null })}
              />
            </label>
            <label>
              IBAN
              <input
                value={doc.iban ?? ""}
                onChange={(event) => props.onUpdate({ ...doc, iban: event.target.value || null })}
              />
            </label>
            <label>
              E2E ID
              <input
                value={doc.e2e_id ?? ""}
                onChange={(event) => props.onUpdate({ ...doc, e2e_id: event.target.value || null })}
              />
            </label>
            <label>
              Vendor Raw
              <input
                value={doc.vendor_raw}
                onChange={(event) => props.onUpdate(applyDocVendor(doc, event.target.value))}
              />
            </label>
            <label>
              Vendor Norm
              <input value={doc.vendor_norm} readOnly />
            </label>
            <label>
              Text Raw
              <textarea
                value={doc.text_raw}
                onChange={(event) => props.onUpdate(applyDocText(doc, event.target.value))}
              />
            </label>
            <label>
              Text Norm
              <textarea value={doc.text_norm} readOnly />
            </label>
          </div>
        ) : (
          <div className="muted">No docs in this case.</div>
        )}
      </div>
    </section>
  );
}

export function TxsEditor(props: TxsEditorProps) {
  const tx = props.txs.find((item) => item.id === props.selectedId) ?? props.txs[0];
  const autoText = tx ? props.autoTextMap[tx.id] ?? true : true;

  return (
    <section className="panel">
      <div className="row">
        <h3>Txs</h3>
        <button onClick={props.onAdd}>Add Tx</button>
        {tx && (
          <button className="danger" onClick={() => props.onRemove(tx.id)}>
            Remove
          </button>
        )}
      </div>
      <div className="split">
        <div className="list">
          {props.txs.map((item) => (
            <button
              key={item.id}
              className={item.id === tx?.id ? "active" : undefined}
              onClick={() => props.onSelect(item.id)}
            >
              {item.id} - {item.reference ?? "no ref"}
            </button>
          ))}
        </div>
        {tx ? (
          <div className="row">
            <label>
              ID
              <input value={tx.id} readOnly />
            </label>
            <label>
              Amount
              <input
                type="number"
                value={tx.amount}
                onChange={(event) => props.onUpdate({ ...tx, amount: Number(event.target.value) })}
              />
            </label>
            <label>
              Direction
              <select
                value={tx.direction}
                onChange={(event) => props.onUpdate({ ...tx, direction: event.target.value as CanonicalTx["direction"] })}
              >
                <option value="out">out</option>
                <option value="in">in</option>
              </select>
            </label>
            <label>
              Booking Date
              <input
                type="date"
                value={tx.booking_date.slice(0, 10)}
                onChange={(event) =>
                  props.onUpdate({
                    ...tx,
                    booking_date: `${event.target.value}T00:00:00.000Z`
                  })
                }
              />
            </label>
            <label>
              IBAN
              <input
                value={tx.iban ?? ""}
                onChange={(event) => props.onUpdate({ ...tx, iban: event.target.value || null })}
              />
            </label>
            <label>
              Reference
              <input
                value={tx.reference ?? ""}
                onChange={(event) => {
                  const next = { ...tx, reference: event.target.value || null, ref: event.target.value || null };
                  const textRaw = autoText ? joinText(next.reference, next.description, next.counterparty_name, next.e2e_id) : next.text_raw;
                  props.onUpdate(applyTxText(next, textRaw));
                }}
              />
            </label>
            <label>
              Description
              <input
                value={tx.description ?? ""}
                onChange={(event) => {
                  const next = { ...tx, description: event.target.value || null };
                  const textRaw = autoText ? joinText(next.reference, next.description, next.counterparty_name, next.e2e_id) : next.text_raw;
                  props.onUpdate(applyTxText(next, textRaw));
                }}
              />
            </label>
            <label>
              Counterparty Name
              <input
                value={tx.counterparty_name ?? ""}
                onChange={(event) => {
                  const next = {
                    ...tx,
                    counterparty_name: event.target.value || null,
                    vendor_raw: tx.vendor_raw || event.target.value || ""
                  };
                  const textRaw = autoText ? joinText(next.reference, next.description, next.counterparty_name, next.e2e_id) : next.text_raw;
                  props.onUpdate(applyTxText(applyTxVendor(next, next.vendor_raw), textRaw));
                }}
              />
            </label>
            <label>
              E2E ID
              <input
                value={tx.e2e_id ?? ""}
                onChange={(event) => {
                  const next = { ...tx, e2e_id: event.target.value || null };
                  const textRaw = autoText ? joinText(next.reference, next.description, next.counterparty_name, next.e2e_id) : next.text_raw;
                  props.onUpdate(applyTxText(next, textRaw));
                }}
              />
            </label>
            <label>
              Vendor Raw
              <input
                value={tx.vendor_raw}
                onChange={(event) => props.onUpdate(applyTxVendor(tx, event.target.value))}
              />
            </label>
            <label>
              Vendor Norm
              <input value={tx.vendor_norm} readOnly />
            </label>
            <label>
              Auto text_raw
              <select
                value={autoText ? "on" : "off"}
                onChange={(event) => props.onToggleAutoText(tx.id, event.target.value === "on")}
              >
                <option value="on">on</option>
                <option value="off">off</option>
              </select>
            </label>
            <label>
              Text Raw
              <textarea
                value={tx.text_raw}
                onChange={(event) => props.onUpdate(applyTxText(tx, event.target.value))}
                readOnly={autoText}
              />
            </label>
            <label>
              Text Norm
              <textarea value={tx.text_norm} readOnly />
            </label>
          </div>
        ) : (
          <div className="muted">No txs in this case.</div>
        )}
      </div>
    </section>
  );
}
