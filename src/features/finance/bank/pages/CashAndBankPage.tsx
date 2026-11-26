import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { Modal } from "@/shared/components/exec/Modal";
import { useAuth } from "@/features/platform/auth/AuthContext";
import "@/shared/styles/pipeline.css";

// Finance > Cash and bank. Two tabs:
// - Unallocated cash (backend finance/bank/unallocatedCash.js): money banked in the premium trust account before it is
//   receipted. Record it, then allocate it to a client's policies (an ordinary receipt that draws on it), or void it.
// - Bank statements (backend compliance/regulatory/bankReconciliation.js): import a bank account's statement, see each
//   line matched to a record (or not), match by hand, mark bank charges as needing no record, or turn an unknown credit
//   into unallocated cash. The server checks every rule; this page only collects choices.

interface Cash {
  id: number;
  reference_no: string;
  received_date: string;
  amount: number;
  payer_name: string | null;
  client_id: number | null;
  client_name: string | null;
  bank_reference: string | null;
  narration: string | null;
  status: "Open" | "Voided";
  state: "Unallocated" | "Part allocated" | "Allocated" | "Voided";
  allocated: number;
  remaining: number;
  age_days: number;
  receipts: { id: number; receipt_no: string; amount: number }[];
  void_reason: string | null;
}
interface CashList {
  entries: Cash[];
  ageing: { total: number; d0_30: number; d31_60: number; d61_90: number; over_90: number };
}
interface OpenTx { id: number; policy_no: string | null; class_of_business: string | null; insurer_name?: string | null; receiptable: number }
interface BankAccount { id: number; code: string; name: string; kind: "premium" | "claims" | "operating" }
interface Line {
  id: number;
  line_date: string;
  description: string | null;
  reference: string | null;
  amount: number;
  balance: number | null;
  status: "Unmatched" | "Matched" | "Ignored";
  match_type: string | null;
  match_label: string | null;
  note: string | null;
  matched_by: string | null;
}
interface LinesResponse {
  account: BankAccount;
  totals: { unmatched: number; matched: number; ignored: number; money_in: number; money_out: number };
  lines: Line[];
  imports: { id: number; file_name: string; period_start: string; period_end: string; line_count: number; imported_by: string; imported_at: string }[];
}
interface Candidate { type: string; id: number; date: string; amount: number; label: string; days: number; reference_match: boolean; type_label: string }

const today = () => new Date().toISOString().slice(0, 10);
const STATE_BADGE: Record<Cash["state"], string> = {
  Unallocated: "badge badge-warning", "Part allocated": "badge badge-secondary", Allocated: "badge badge-paid", Voided: "badge badge-cancelled",
};
const LINE_BADGE: Record<Line["status"], string> = { Unmatched: "badge badge-unpaid", Matched: "badge badge-paid", Ignored: "badge badge-cancelled" };

export function CashAndBankPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "bank" ? "bank" : "cash";
  const setTab = (t: string) => setParams((p) => { const n = new URLSearchParams(p); n.set("tab", t); return n; }, { replace: true });
  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Financials</p>
          <h1>Cash and bank</h1>
          <p className="text-muted">Money banked before it is receipted, and each bank statement line matched to the record behind it.</p>
        </div>
      </div>
      <div className="actions-row" role="tablist" style={{ marginBottom: "1rem" }}>
        <button type="button" role="tab" aria-selected={tab === "cash"} className={tab === "cash" ? "btn" : "btn btn-secondary"} onClick={() => setTab("cash")}>Unallocated cash</button>
        <button type="button" role="tab" aria-selected={tab === "bank"} className={tab === "bank" ? "btn" : "btn btn-secondary"} onClick={() => setTab("bank")}>Bank statements</button>
      </div>
      {tab === "cash" ? <UnallocatedCashTab /> : <BankStatementsTab />}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ unallocated cash

function UnallocatedCashTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [openOnly, setOpenOnly] = useState(true);
  const { data, isLoading } = useQuery({ queryKey: ["unallocated-cash", openOnly], queryFn: () => api.get<CashList>(`/api/unallocated-cash${openOnly ? "?open=1" : ""}`) });
  const clientsQuery = useQuery({ queryKey: ["receipts", "form-options"], queryFn: () => api.get<{ clients: { id: number; name: string }[] }>("/api/receipts/meta/form-options") });
  const clients = clientsQuery.data?.clients ?? [];
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["unallocated-cash"] });

  // Record
  const [recording, setRecording] = useState(false);
  const [rec, setRec] = useState({ received_date: today(), amount: "", payer_name: "", client_id: "", bank_reference: "", narration: "" });
  const record = useMutation({
    mutationFn: () => api.post<{ entry: Cash }>("/api/unallocated-cash", rec),
    onSuccess: (r) => { setRecording(false); setNotice(`Recorded ${r.entry.reference_no}.`); void refresh(); },
  });
  // Allocate
  const [allocating, setAllocating] = useState<Cash | null>(null);
  const [allocClient, setAllocClient] = useState("");
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const txQuery = useQuery({
    queryKey: ["receipts", "open-transactions", allocClient],
    queryFn: () => api.get<{ transactions: OpenTx[] }>(`/api/receipts/client/${allocClient}/open-transactions`),
    enabled: Boolean(allocating && allocClient),
  });
  const allocTotal = Object.values(amounts).reduce((s, v) => s + (Number(v) || 0), 0);
  const allocate = useMutation({
    mutationFn: () => api.post<{ receiptNo: string }>(`/api/unallocated-cash/${allocating!.id}/allocate`, {
      client_id: Number(allocClient),
      allocations: Object.entries(amounts).filter(([, v]) => Number(v) > 0).map(([id, v]) => ({ transaction_id: Number(id), amount: Number(v) })),
    }),
    onSuccess: (r) => { setAllocating(null); setNotice(`Receipt ${r.receiptNo} created from ${allocating?.reference_no}.`); void refresh(); },
  });
  // Void
  const [voiding, setVoiding] = useState<Cash | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const voidIt = useMutation({
    mutationFn: () => api.post(`/api/unallocated-cash/${voiding!.id}/void`, { reason: voidReason }),
    onSuccess: () => { setVoiding(null); void refresh(); },
  });

  const a = data?.ageing;
  return (
    <>
      {notice && <div className="flash flash-success">{notice}</div>}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Unallocated cash</h2>
          <div className="actions-row">
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
              <input type="checkbox" style={{ width: "auto" }} checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Only money still to allocate
            </label>
            {user?.canWrite && <button type="button" className="btn btn-sm" onClick={() => { record.reset(); setRec({ received_date: today(), amount: "", payer_name: "", client_id: "", bank_reference: "", narration: "" }); setRecording(true); }}>Record money received</button>}
          </div>
        </div>
        {a && (
          <p className="text-muted" style={{ marginBottom: 0 }}>
            Still to allocate: <strong>{fmtMoney(a.total)}</strong>. By age: 0–30 days {fmtMoney(a.d0_30)} · 31–60 {fmtMoney(a.d31_60)} · 61–90 {fmtMoney(a.d61_90)} · over 90 <strong>{fmtMoney(a.over_90)}</strong>
          </p>
        )}
        <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
          <table className="data-table">
            <thead><tr><th>Reference</th><th>Received</th><th>From</th><th className="num">Amount</th><th className="num">Left</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {isLoading && <tr><td colSpan={7}>Loading…</td></tr>}
              {data && data.entries.length === 0 && <tr><td colSpan={7}>{openOnly ? "No money waiting to be allocated." : "Nothing recorded yet."}</td></tr>}
              {data?.entries.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.reference_no}</strong>{c.bank_reference && <div className="text-muted" style={{ fontSize: "0.8rem" }}>{c.bank_reference}</div>}</td>
                  <td>{c.received_date}<div className="text-muted" style={{ fontSize: "0.8rem" }}>{c.age_days === 0 ? "today" : `${c.age_days} day${c.age_days === 1 ? "" : "s"} ago`}</div></td>
                  <td>{c.client_name ?? c.payer_name ?? "—"}{c.client_name && c.payer_name && <div className="text-muted" style={{ fontSize: "0.8rem" }}>{c.payer_name}</div>}</td>
                  <td className="num">{fmtMoney(c.amount)}</td>
                  <td className="num"><strong>{fmtMoney(c.remaining)}</strong></td>
                  <td>
                    <span className={STATE_BADGE[c.state]}>{c.state}</span>
                    {c.receipts.map((r) => <div key={r.id} style={{ fontSize: "0.8rem" }}><Link to={`/receipts/${r.id}`}>{r.receipt_no}</Link> {fmtMoney(r.amount)}</div>)}
                    {c.void_reason && <div className="text-muted" style={{ fontSize: "0.8rem" }}>{c.void_reason}</div>}
                  </td>
                  <td>
                    {user?.canWrite && c.remaining > 0 && (
                      <div className="actions-row">
                        <button type="button" className="btn btn-sm" onClick={() => { allocate.reset(); setAllocClient(c.client_id ? String(c.client_id) : ""); setAmounts({}); setAllocating(c); }}>Allocate</button>
                        {c.allocated === 0 && <button type="button" className="btn btn-sm btn-secondary" onClick={() => { voidIt.reset(); setVoidReason(""); setVoiding(c); }}>Void</button>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={recording} title="Record money received" onClose={() => setRecording(false)} footer={<>
        <button type="button" className="btn btn-secondary" onClick={() => setRecording(false)}>Cancel</button>
        <button type="button" className="btn" disabled={record.isPending} onClick={() => record.mutate()}>{record.isPending ? "Saving…" : "Record"}</button>
      </>}>
        {record.isError && <div className="flash flash-error">{(record.error as Error).message}</div>}
        <p className="text-muted" style={{ marginTop: 0 }}>For money already in the premium trust account that can't be receipted yet.</p>
        <div className="form-grid">
          <div className="field"><label htmlFor="uc_date">Date received</label><input id="uc_date" type="date" max={today()} value={rec.received_date} onChange={(e) => setRec({ ...rec, received_date: e.target.value })} /></div>
          <div className="field"><label htmlFor="uc_amount">Amount (NGN)</label><input id="uc_amount" inputMode="decimal" value={rec.amount} onChange={(e) => setRec({ ...rec, amount: e.target.value })} /></div>
          <div className="field"><label htmlFor="uc_payer">Paid by (as the bank shows it)</label><input id="uc_payer" value={rec.payer_name} onChange={(e) => setRec({ ...rec, payer_name: e.target.value })} /></div>
          <div className="field"><label htmlFor="uc_client">Client, if known</label>
            <select id="uc_client" value={rec.client_id} onChange={(e) => setRec({ ...rec, client_id: e.target.value })}>
              <option value="">Not identified yet</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="uc_ref">Bank reference</label><input id="uc_ref" value={rec.bank_reference} onChange={(e) => setRec({ ...rec, bank_reference: e.target.value })} /></div>
          <div className="field"><label htmlFor="uc_note">Note</label><input id="uc_note" value={rec.narration} onChange={(e) => setRec({ ...rec, narration: e.target.value })} /></div>
        </div>
      </Modal>

      <Modal open={allocating !== null} wide title={`Allocate ${allocating?.reference_no ?? ""}: ${fmtMoney(allocating?.remaining ?? 0)} left`} onClose={() => setAllocating(null)} footer={<>
        <button type="button" className="btn btn-secondary" onClick={() => setAllocating(null)}>Cancel</button>
        <button type="button" className="btn" disabled={allocate.isPending || !allocClient || allocTotal <= 0} onClick={() => allocate.mutate()}>{allocate.isPending ? "Saving…" : `Create receipt for ${fmtMoney(allocTotal)}`}</button>
      </>}>
        {allocate.isError && <div className="flash flash-error">{(allocate.error as Error).message}</div>}
        <div className="field">
          <label htmlFor="al_client">Client</label>
          <select id="al_client" value={allocClient} disabled={Boolean(allocating?.client_id)} onChange={(e) => { setAllocClient(e.target.value); setAmounts({}); }}>
            <option value="">Choose the client who paid</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {allocClient && (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Policy</th><th>Insurer</th><th className="num">Can receipt</th><th className="num">Allocate</th></tr></thead>
              <tbody>
                {txQuery.isLoading && <tr><td colSpan={4}>Loading…</td></tr>}
                {txQuery.data?.transactions.length === 0 && <tr><td colSpan={4}>This client has no policy with premium to receipt.</td></tr>}
                {txQuery.data?.transactions.map((t) => (
                  <tr key={t.id}>
                    <td>{t.policy_no || `#${t.id}`}<div className="text-muted" style={{ fontSize: "0.8rem" }}>{t.class_of_business}</div></td>
                    <td>{t.insurer_name ?? "—"}</td>
                    <td className="num">{fmtMoney(t.receiptable)}</td>
                    <td className="num"><input aria-label={`Amount for ${t.policy_no || t.id}`} inputMode="decimal" style={{ maxWidth: "9rem" }} value={amounts[t.id] ?? ""} onChange={(e) => setAmounts({ ...amounts, [t.id]: e.target.value })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <Modal open={voiding !== null} title={`Void ${voiding?.reference_no ?? ""}`} onClose={() => setVoiding(null)} footer={<>
        <button type="button" className="btn btn-secondary" onClick={() => setVoiding(null)}>Cancel</button>
        <button type="button" className="btn btn-danger" disabled={voidIt.isPending || !voidReason.trim()} onClick={() => voidIt.mutate()}>Void</button>
      </>}>
        {voidIt.isError && <div className="flash flash-error">{(voidIt.error as Error).message}</div>}
        <div className="field"><label htmlFor="uc_void">Reason (required)</label><textarea id="uc_void" rows={2} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} /></div>
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ bank statements

function BankStatementsTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const accountsQuery = useQuery({ queryKey: ["bank-rec", "accounts"], queryFn: () => api.get<{ accounts: BankAccount[] }>("/api/bank-reconciliation/accounts") });
  const accounts = accountsQuery.data?.accounts ?? [];
  const [accountId, setAccountId] = useState("");
  const account = accountId || (accounts[0] ? String(accounts[0].id) : "");
  const [status, setStatus] = useState("");
  const linesQuery = useQuery({
    queryKey: ["bank-rec", "lines", account, status],
    queryFn: () => api.get<LinesResponse>(`/api/bank-reconciliation/lines?account_id=${account}${status ? `&status=${status}` : ""}`),
    enabled: Boolean(account),
  });
  const data = linesQuery.data;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["bank-rec"] });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Import
  const [file, setFile] = useState<File | null>(null);
  const importIt = useMutation({
    mutationFn: async () => {
      const body = new FormData();
      body.append("account_id", account);
      body.append("file", file!);
      return api.upload<{ imported: number; duplicates: number; matched: number }>("/api/bank-reconciliation/import", body);
    },
    onSuccess: (r) => { setError(null); setFile(null); setNotice(`Imported ${r.imported} line(s)${r.duplicates ? `, skipped ${r.duplicates} already held` : ""}; ${r.matched} matched on their own.`); void refresh(); },
    onError: (e) => setError((e as Error).message),
  });

  // Working on one line
  const [working, setWorking] = useState<Line | null>(null);
  const candQuery = useQuery({
    queryKey: ["bank-rec", "candidates", working?.id],
    queryFn: () => api.get<{ candidates: Candidate[] }>(`/api/bank-reconciliation/lines/${working!.id}/candidates`),
    enabled: Boolean(working && working.status === "Unmatched"),
  });
  const [ignoreNote, setIgnoreNote] = useState("");
  const [payer, setPayer] = useState("");
  const lineAction = useMutation({
    mutationFn: (a: { path: string; body?: unknown }) => api.post(`/api/bank-reconciliation/lines/${working!.id}/${a.path}`, a.body),
    onSuccess: () => { setWorking(null); void refresh(); },
  });
  const isPremium = data?.account.kind === "premium";

  const t = data?.totals;
  const accountLabel = useMemo(() => new Map(accounts.map((a) => [String(a.id), `${a.code} ${a.name}`])), [accounts]);

  return (
    <>
      {notice && <div className="flash flash-success">{notice}</div>}
      {error && <div className="flash flash-error">{error}</div>}
      <div className="card">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="br_account">Bank account</label>
            <select id="br_account" value={account} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="br_status">Show</label>
            <select id="br_status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All lines</option><option value="Unmatched">Unmatched</option><option value="Matched">Matched</option><option value="Ignored">Ignored</option>
            </select>
          </div>
          {user?.canWrite && (
            <div className="field">
              <label htmlFor="br_file">Import a statement (.csv, .xlsx or MT940)</label>
              <input id="br_file" type="file" accept=".csv,.xlsx,.sta,.mt940,.940,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <button type="button" className="btn btn-sm" style={{ marginTop: "0.5rem" }} disabled={!file || !account || importIt.isPending} onClick={() => importIt.mutate()}>
                {importIt.isPending ? "Importing…" : `Import into ${accountLabel.get(account) ?? "account"}`}
              </button>
            </div>
          )}
        </div>
        {t && (
          <p style={{ marginBottom: 0 }}>
            <span className="badge badge-unpaid">{t.unmatched} unmatched</span>{" "}
            <span className="badge badge-paid">{t.matched} matched</span>{" "}
            <span className="badge badge-cancelled">{t.ignored} ignored</span>{" "}
            <span className="text-muted">Money in {fmtMoney(t.money_in)} · money out {fmtMoney(Math.abs(t.money_out))}</span>
          </p>
        )}
      </div>

      <div className="card">
        <h2>Statement lines</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Date</th><th>Description</th><th className="num">Money in</th><th className="num">Money out</th><th>Matched to</th><th></th></tr></thead>
            <tbody>
              {linesQuery.isLoading && <tr><td colSpan={6}>Loading…</td></tr>}
              {data && data.lines.length === 0 && <tr><td colSpan={6}>No statement lines yet. Import a statement for this account.</td></tr>}
              {data?.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.line_date}</td>
                  <td>{l.description ?? "—"}{l.reference && <div className="text-muted" style={{ fontSize: "0.8rem" }}>{l.reference}</div>}</td>
                  <td className="num">{l.amount > 0 ? fmtMoney(l.amount) : ""}</td>
                  <td className="num">{l.amount < 0 ? fmtMoney(-l.amount) : ""}</td>
                  <td>
                    <span className={LINE_BADGE[l.status]}>{l.status}</span>
                    {l.match_label && <div style={{ fontSize: "0.8rem" }}>{l.match_label}</div>}
                    {l.note && <div className="text-muted" style={{ fontSize: "0.8rem" }}>{l.note}</div>}
                  </td>
                  <td>{user?.canWrite && <button type="button" className="btn btn-sm btn-secondary" onClick={() => { lineAction.reset(); setIgnoreNote(""); setPayer(l.description?.slice(0, 80) ?? ""); setWorking(l); }}>{l.status === "Unmatched" ? "Match" : "Change"}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={working !== null} wide title={working ? `${working.line_date}: ${working.amount > 0 ? "in" : "out"} ${fmtMoney(Math.abs(working.amount))}` : ""} onClose={() => setWorking(null)}>
        {lineAction.isError && <div className="flash flash-error">{(lineAction.error as Error).message}</div>}
        {working && <p style={{ marginTop: 0 }}>{working.description}{working.reference ? ` (${working.reference})` : ""}</p>}
        {working && working.status !== "Unmatched" ? (
          <>
            <p>This line is {working.status.toLowerCase()}{working.match_label ? ` to ${working.match_label}` : ""}.</p>
            <button type="button" className="btn btn-secondary" onClick={() => lineAction.mutate({ path: "unmatch" })}>Undo</button>
          </>
        ) : (
          <>
            <h3>Records with the same amount</h3>
            {candQuery.isLoading && <p>Looking…</p>}
            {candQuery.data?.candidates.length === 0 && <p className="text-muted">No unmatched record has this amount within 7 days of the line.</p>}
            <ul style={{ paddingLeft: "1.1rem" }}>
              {candQuery.data?.candidates.map((c) => (
                <li key={`${c.type}:${c.id}`} style={{ marginBottom: "0.4rem" }}>
                  {c.label} · {c.date}{c.days ? ` (${c.days} day${c.days === 1 ? "" : "s"} apart)` : ""}{c.reference_match ? " · reference matches" : ""}{" "}
                  <button type="button" className="btn btn-sm" onClick={() => lineAction.mutate({ path: "match", body: { type: c.type, id: c.id } })}>Match</button>
                </li>
              ))}
            </ul>
            {isPremium && working && working.amount > 0 && (
              <>
                <h3>Nobody's payment yet?</h3>
                <div className="field"><label htmlFor="br_payer">Paid by</label><input id="br_payer" value={payer} onChange={(e) => setPayer(e.target.value)} /></div>
                <button type="button" className="btn btn-sm" onClick={() => lineAction.mutate({ path: "unallocated", body: { payer_name: payer } })}>Record as unallocated cash</button>
              </>
            )}
            <h3>Needs no record</h3>
            <div className="field"><label htmlFor="br_note">Why (e.g. bank charges booked by journal)</label><input id="br_note" value={ignoreNote} onChange={(e) => setIgnoreNote(e.target.value)} /></div>
            <button type="button" className="btn btn-sm btn-secondary" disabled={!ignoreNote.trim()} onClick={() => lineAction.mutate({ path: "ignore", body: { note: ignoreNote } })}>Mark as needing no record</button>
          </>
        )}
      </Modal>
    </>
  );
}
