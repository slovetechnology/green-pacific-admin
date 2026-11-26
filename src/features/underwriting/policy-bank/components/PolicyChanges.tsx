import { useState } from "react";
import type { ChangedWording, DraftChanges, WordDiff } from "../api/engine";

/** A reworded clause with the words that moved marked: deletions struck through, additions underlined. */
export function WordDiffView({ parts }: { parts: WordDiff[] }) {
  return (
    <p className="pb-worddiff">
      {parts.map((s, i) => (s.type === "same" ? <span key={i}>{s.text}</span> : s.type === "add" ? <ins key={i}>{s.text}</ins> : <del key={i}>{s.text}</del>))}
    </p>
  );
}

function Changed({ e }: { e: ChangedWording }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <strong>{e.name}</strong> <span className="pb-muted">({e.section}) v{e.from.version} to v{e.to.version}{e.textChanged ? ", text changed" : ", same text"}</span>
      {e.wordDiff && <> <button type="button" className="pb-link" onClick={() => setOpen(!open)}>{open ? "Hide the difference" : "Show the difference"}</button></>}
      {open && e.wordDiff && <WordDiffView parts={e.wordDiff} />}
    </li>
  );
}

/**
 * What an amendment or a renewal changes against the policy it follows. For a renewal the reader must confirm they have
 * read the changes; the confirmation lasts only while the changes stay as they were when confirmed.
 */
export function PolicyChanges({ changes, canConfirm, onConfirm, confirming, unsaved }: {
  changes: DraftChanges; canConfirm: boolean; onConfirm: () => void; confirming: boolean; unsaved?: boolean;
}) {
  const { diff, parent, confirmation } = changes;
  const c = diff.counts;
  return (
    <div className="card pb-changes">
      <h3 className="card-title">{changes.kind === "amendment" ? `Changes made by amendment ${changes.amendmentNo}` : "Changes from the previous policy"}</h3>
      <p className="pb-muted">
        Against policy {parent.policyNumber} issued {parent.issuedAt?.slice(0, 10)}
        {changes.kind === "amendment" && changes.effectiveDate ? `, effective ${changes.effectiveDate}` : ""}
        {changes.reason ? `. Reason: ${changes.reason}` : ""}
      </p>
      {unsaved && <p className="pb-warn">You have unsaved changes. Save the draft to refresh this list.</p>}
      {!diff.hasChanges ? <p>Nothing in the wording, limits, excesses or details has changed.</p> : (
        <>
          {diff.wording && <p>Wording moves from <strong>{diff.wording.from}</strong> to <strong>{diff.wording.to}</strong>.</p>}
          <p className="pb-muted">
            Wordings: {c.wordingsAdded} added, {c.wordingsRemoved} removed, {c.wordingsChanged} changed · limits and excesses: {c.limitsAdded} added, {c.limitsRemoved} removed, {c.limitsChanged} changed · details: {c.details}
          </p>
          {diff.components.added.length > 0 && <><h4>Wordings added</h4><ul className="pb-list">{diff.components.added.map((e) => <li key={e.code}>{e.name} <span className="pb-muted">({e.section}, v{e.version})</span></li>)}</ul></>}
          {diff.components.removed.length > 0 && <><h4>Wordings removed</h4><ul className="pb-list">{diff.components.removed.map((e) => <li key={e.code}>{e.name} <span className="pb-muted">({e.section})</span></li>)}</ul></>}
          {diff.components.changed.length > 0 && <><h4>Wordings changed</h4><ul className="pb-list">{diff.components.changed.map((e) => <Changed key={e.code} e={e} />)}</ul></>}
          {(diff.limits.added.length + diff.limits.removed.length + diff.limits.changed.length) > 0 && (
            <>
              <h4>Limits, sub-limits and excesses</h4>
              <ul className="pb-list">
                {diff.limits.added.map((l) => <li key={`a${l.code}`}>Added: {l.name} <span className="pb-muted">({l.text})</span></li>)}
                {diff.limits.removed.map((l) => <li key={`r${l.code}`}>Removed: {l.name} <span className="pb-muted">({l.text})</span></li>)}
                {diff.limits.changed.map((l) => <li key={`c${l.code}`}>{l.name}: {l.from} → {l.to}</li>)}
              </ul>
            </>
          )}
          {diff.details.length > 0 && (
            <>
              <h4>Details</h4>
              <table><thead><tr><th>Detail</th><th>Was</th><th>Now</th></tr></thead>
                <tbody>{diff.details.map((d) => <tr key={d.key}><td>{d.label}</td><td>{d.from ?? "—"}</td><td>{d.to ?? "—"}</td></tr>)}</tbody>
              </table>
            </>
          )}
        </>
      )}
      {changes.renewal && (changes.renewal.dropped.length > 0 || changes.renewal.added.length > 0) && (
        <p className="pb-warn">
          Moving onto the latest wording (v{changes.renewal.toProductVersion}) dropped {changes.renewal.dropped.length} wording(s) the old version had and added {changes.renewal.added.length} it now requires.
        </p>
      )}
      {confirmation.required && (
        <div className={`flash ${confirmation.confirmed ? "flash-success" : "flash-warning"}`} style={{ marginTop: "1rem" }}>
          {confirmation.confirmed
            ? `Confirmed by ${confirmation.by} on ${confirmation.at?.slice(0, 10)}. Editing the renewal withdraws the confirmation.`
            : "A renewal can only be submitted once someone has read these changes and confirmed them."}
          {!confirmation.confirmed && canConfirm && (
            <div style={{ marginTop: "0.5rem" }}>
              <button type="button" className="btn" disabled={confirming || unsaved} onClick={onConfirm}>{confirming ? "Confirming…" : "I have reviewed these changes"}</button>
              {unsaved && <span className="pb-muted"> Save the draft first.</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
