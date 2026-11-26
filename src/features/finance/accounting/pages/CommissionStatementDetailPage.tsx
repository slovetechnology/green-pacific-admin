import { useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { RoleGate } from "@/app/guards/RoleGate";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { useAuth } from "@/features/platform/auth/AuthContext";
import {
  LINE_STATUS_HELP,
  type Candidate,
  type LineStatus,
  type StatementDetail,
  type StatementLine,
} from "../lib/commissionStatements";
import { promptDialog } from "@/shared/components/Dialogs";

const STATUS_ORDER: LineStatus[] = ["Unmatched", "Ambiguous", "Variance", "Matched", "Ignored"];

// One commission statement: resolve lines, record the deposit, reconcile.
export function CommissionStatementDetailPage() {
  const { statementId } = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<LineStatus | "">("");
  const [matching, setMatching] = useState<StatementLine | null>(null);
  const key = ["commission-statements", statementId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => api.get<StatementDetail>(`/api/commission-statements/${statementId}`),
  });

  async function act(path: string, body: unknown) {
    setError(null);
    try {
      const detail = await api.post<StatementDetail>(`/api/commission-statements/${statementId}${path}`, body);
      queryClient.setQueryData(key, detail);
      await queryClient.invalidateQueries({ queryKey: ["commission-statements"], exact: true });
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      return false;
    }
  }

  if (isLoading) return <p>Loading…</p>;
  if (!data) return <p>Statement not found.</p>;
  const { statement, lines, totals } = data;
  const isDraft = statement.status === "Draft";
  const canWrite = !!user?.canWrite;
  const shown = lines
    .filter((l) => !filter || l.status === filter)
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || (a.rowNo ?? 0) - (b.rowNo ?? 0));

  async function ignore(line: StatementLine) {
    const note = await promptDialog({ message: `Why ignore ${line.policyNo}? (e.g. "belongs to another broker")`, required: true, multiline: true });
    if (note && note.trim()) void act(`/lines/${line.id}`, { ignore: true, note });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/commission-statements">Commission Statements</Link>
          </p>
          <h1>
            {statement.insurer_name}: {statement.statement_ref || statement.file_name || `Statement #${statement.id}`}
          </h1>
          <p style={{ color: "var(--text-muted)" }}>
            {statement.period_start ? `Period ${statement.period_start} → ${statement.period_end}. ` : ""}
            Imported by {statement.created_by || "—"} on {statement.created_at.slice(0, 10)}.
          </p>
        </div>
        <StatusBadge status={statement.status} />
      </div>

      {error && <div className="flash flash-error">{error}</div>}
      {statement.status === "Reconciled" && (
        <div className="flash flash-success">
          Reconciled by {statement.reconciled_by} on {statement.reconciled_at?.slice(0, 10)}. Figures are frozen.
          {statement.reconcile_note ? ` Note: ${statement.reconcile_note}` : ""}
        </div>
      )}
      {statement.status === "Void" && <div className="flash flash-error">Void: {statement.void_reason}</div>}

      <div className="card">
        <h2>Reconciliation</h2>
        <div className="detail-grid">
          <div>
            <div className="k">Our books expect (matched lines)</div>
            <div className="v">{fmtMoney(totals.expected)}</div>
          </div>
          <div>
            <div className="k">Statement total</div>
            <div className="v">{fmtMoney(totals.statement)}</div>
          </div>
          <div>
            <div className="k">Statement vs our books</div>
            <div className="v">{fmtMoney(totals.matchedLinesVariance)}</div>
          </div>
          <div>
            <div className="k">Bank deposit</div>
            <div className="v">
              {totals.deposit === null ? "Not recorded" : `${fmtMoney(totals.deposit)} on ${statement.deposit_date}`}
              {statement.deposit_reference ? ` (${statement.deposit_reference})` : ""}
            </div>
          </div>
          {(totals.vatOnCommission !== 0 || totals.whtOnCommission !== 0) && (
            <div>
              <div className="k">Deposit to expect</div>
              <div className="v">
                {fmtMoney(totals.expectedDeposit)}
                <div className="text-muted" style={{ fontSize: "0.8rem" }}>statement + VAT {fmtMoney(totals.vatOnCommission)} − WHT {fmtMoney(totals.whtOnCommission)}</div>
              </div>
            </div>
          )}
          <div>
            <div className="k">Deposit vs expected</div>
            <div className="v">{totals.depositVsExpected === null ? "—" : fmtMoney(totals.depositVsExpected)}</div>
          </div>
        </div>
        <div className="toolbar">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              className={`btn-sm ${filter === s ? "btn" : "btn-secondary"}`}
              title={LINE_STATUS_HELP[s]}
              onClick={() => setFilter(filter === s ? "" : s)}
            >
              {s}: {totals.counts[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Lines</h2>
        <div className="table-wrap">
          <table className="data-grid-table">
            <thead>
              <tr>
                <th>Row</th>
                <th>Policy no (statement)</th>
                <th>Insured (statement)</th>
                <th className="num">Commission</th>
                <th>Matched policy</th>
                <th className="num">Expected</th>
                <th className="num">Difference</th>
                <th>Status</th>
                {isDraft && canWrite && <th></th>}
              </tr>
            </thead>
            <tbody>
              {shown.map((line) => (
                <tr key={line.id}>
                  <td>{line.rowNo ?? "—"}</td>
                  <td>{line.policyNo}</td>
                  <td>{line.clientName || "—"}</td>
                  <td className="num">{fmtMoney(line.commission)}</td>
                  <td>
                    {line.transactionId ? (
                      <>
                        <Link to={`/transactions/${line.transactionId}`}>{line.matchedPolicyNo || `#${line.transactionId}`}</Link>
                        {" "}
                        <small>
                          {line.matchedClientName}
                          {line.matchedBillingMode === "Agency" ? " · Agency Bill" : ""}
                          {line.matchMethod === "manual" ? " · matched by hand" : ""}
                        </small>
                      </>
                    ) : (
                      "—"
                    )}
                    {line.note && <div><small>Note: {line.note}</small></div>}
                  </td>
                  <td className="num">{line.transactionId ? fmtMoney(line.expected) : "—"}</td>
                  <td className="num">{line.status === "Variance" ? fmtMoney(line.variance) : "—"}</td>
                  <td title={LINE_STATUS_HELP[line.status]}>
                    <StatusBadge status={line.status} />
                  </td>
                  {isDraft && canWrite && (
                    <td>
                      {line.status !== "Ignored" && (
                        <button type="button" className="btn-secondary btn btn-sm" onClick={() => setMatching(line)}>
                          {line.transactionId ? "Change" : "Match"}
                        </button>
                      )}{" "}
                      {line.status !== "Ignored" && (
                        <button type="button" className="btn-secondary btn btn-sm" onClick={() => ignore(line)}>
                          Ignore
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {matching && (
        <MatchPanel
          statementId={statementId!}
          line={matching}
          onClose={() => setMatching(null)}
          onChoose={async (transactionId, note) => {
            if (await act(`/lines/${matching.id}`, { transaction_id: transactionId, note })) setMatching(null);
          }}
        />
      )}

      {isDraft && (
        <RoleGate need="write">
          <DepositForm statement={data.statement} onSave={(body) => act("/deposit", body)} />
          <ReconcileForm detail={data} onReconcile={(body) => act("/reconcile", body)} />
        </RoleGate>
      )}
      {statement.status !== "Void" && (
        <RoleGate need="write">
          <button
            type="button"
            className="btn-danger btn btn-sm"
            onClick={async () => {
              const reason = await promptDialog({
                title: "Void statement",
                message: statement.status === "Reconciled"
                  ? "Void this reconciled statement? Its commission will no longer count as received. Reason:"
                  : "Reason for voiding this statement:",
                required: true, multiline: true, confirmLabel: "Void",
              });
              if (reason && reason.trim()) void act("/void", { reason });
            }}
          >
            Void statement
          </button>
        </RoleGate>
      )}
    </div>
  );
}

function MatchPanel({
  statementId,
  line,
  onClose,
  onChoose,
}: {
  statementId: string;
  line: StatementLine;
  onClose: () => void;
  onChoose: (transactionId: number, note: string) => void;
}) {
  const [q, setQ] = useState(line.policyNo);
  const [note, setNote] = useState("");
  const { data, isFetching } = useQuery({
    queryKey: ["commission-statements", statementId, "candidates", q],
    queryFn: () => api.get<{ candidates: Candidate[] }>(`/api/commission-statements/${statementId}/candidates?q=${encodeURIComponent(q)}`),
  });
  return (
    <div className="card">
      <div className="page-header">
        <h2>
          Match line {line.rowNo}: {line.policyNo}, {fmtMoney(line.commission)}
        </h2>
        <button type="button" className="btn-secondary btn btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="form-grid">
        <label>
          Search this insurer's policies (policy no or client)
          <input value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label>
          Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. typo on insurer's statement" />
        </label>
      </div>
      {isFetching ? (
        <p>Searching…</p>
      ) : !data?.candidates.length ? (
        <p>No policies found for this insurer.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-grid-table">
            <thead>
              <tr>
                <th>Policy</th>
                <th>Client</th>
                <th>Date</th>
                <th className="num">Premium</th>
                <th className="num">Our commission</th>
                <th>Billing</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.candidates.map((c) => (
                <tr key={c.id} style={line.candidateIds.includes(c.id) ? { fontWeight: 600 } : undefined}>
                  <td>
                    {c.policy_no || `#${c.id}`}
                    {c.parent_transaction_id ? " (endorsement)" : ""}
                  </td>
                  <td>{c.client_name}</td>
                  <td>{c.trans_date || "—"}</td>
                  <td className="num">{fmtMoney(c.premium_due)}</td>
                  <td className="num">{fmtMoney(c.total_brokerage)}</td>
                  <td>{c.billing_mode}</td>
                  <td>
                    <button type="button" className="btn btn-sm" onClick={() => onChoose(c.id, note)}>
                      Use this
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DepositForm({ statement, onSave }: { statement: StatementDetail["statement"]; onSave: (body: unknown) => Promise<boolean> }) {
  const [amount, setAmount] = useState(statement.deposit_amount === null ? "" : String(statement.deposit_amount));
  const [date, setDate] = useState(statement.deposit_date || "");
  const [reference, setReference] = useState(statement.deposit_reference || "");
  return (
    <div className="card">
      <h2>Bank deposit</h2>
      <div className="form-grid">
        <label>
          Amount received
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="As on the bank statement" />
        </label>
        <label>
          Date received
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Bank reference
          <input value={reference} onChange={(e) => setReference(e.target.value)} />
        </label>
      </div>
      <button type="button" className="btn-secondary btn" onClick={() => void onSave({ amount, date, reference })}>
        Save deposit
      </button>
    </div>
  );
}

function ReconcileForm({ detail, onReconcile }: { detail: StatementDetail; onReconcile: (body: unknown) => Promise<boolean> }) {
  const [note, setNote] = useState("");
  const [accept, setAccept] = useState(false);
  const { counts, depositVsExpected } = detail.totals;
  const blocked = counts.Unmatched + counts.Ambiguous;
  // Measured against the deposit to expect (statement + VAT - WHT), as the server does.
  const gap = depositVsExpected !== null && Math.abs(depositVsExpected) > 0.004;
  return (
    <div className="card">
      <h2>Reconcile</h2>
      <p>Reconciling freezes these figures and counts the commission as received on each matched policy.</p>
      {blocked > 0 && <div className="flash flash-error">Match or ignore the {blocked} unresolved line(s) first.</div>}
      {detail.totals.deposit === null && <div className="flash flash-error">Record the bank deposit first.</div>}
      {counts.Variance > 0 && (
        <label>
          <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} /> I've reviewed the{" "}
          {counts.Variance} line(s) that differ from our books and accept them
        </label>
      )}
      <label>
        Note{gap ? " (required: the deposit doesn't equal the statement total)" : ""}
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. ₦50 bank charges" />
      </label>
      <button
        type="button"
        className="btn"
        disabled={blocked > 0 || detail.totals.deposit === null}
        onClick={() => void onReconcile({ note, accept_variances: accept })}
      >
        Reconcile statement
      </button>
    </div>
  );
}
