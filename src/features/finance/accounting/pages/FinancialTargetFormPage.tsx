import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { confirmDialog } from "@/shared/components/Dialogs";

interface Row {
  id: number;
  income_target: number;
  income_actual: number;
  expense_target: number;
  notes: string | null;
}

interface Response {
  row: Row | null;
  monthName: string;
}

export function FinancialTargetFormPage() {
  const { year, month } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [incomeTarget, setIncomeTarget] = useState("0");
  const [incomeActual, setIncomeActual] = useState("0");
  const [expenseTarget, setExpenseTarget] = useState("0");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data } = useQuery({
    queryKey: ["financials", year, month],
    queryFn: () => api.get<Response>(`/api/financials/${year}/${month}`),
  });

  useEffect(() => {
    if (data?.row) {
      setIncomeTarget(String(data.row.income_target));
      setIncomeActual(String(data.row.income_actual));
      setExpenseTarget(String(data.row.expense_target));
      setNotes(data.row.notes || "");
    }
  }, [data]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.put(`/api/financials/${year}/${month}`, {
        income_target: incomeTarget, income_actual: incomeActual, expense_target: expenseTarget, notes,
      });
      await queryClient.invalidateQueries({ queryKey: ["financials"] });
      navigate(`/financials?year=${year}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!(await confirmDialog("Delete this month's targets?"))) return;
    await api.delete(`/api/financials/${year}/${month}`);
    await queryClient.invalidateQueries({ queryKey: ["financials"] });
    navigate(`/financials?year=${year}`);
  }

  return (
    <div>
      <div className="page-header">
        <h1>{data?.monthName || "…"} {year}</h1>
      </div>
      {error && <div className="flash flash-error">{error}</div>}

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="income_target">Income target</label>
              <input id="income_target" type="number" step="0.01" value={incomeTarget} onChange={(e) => setIncomeTarget(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="income_actual">Income actual (Total Revenue)</label>
              <input id="income_actual" type="number" step="0.01" value={incomeActual} onChange={(e) => setIncomeActual(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="expense_target">Expense target</label>
              <input id="expense_target" type="number" step="0.01" value={expenseTarget} onChange={(e) => setExpenseTarget(e.target.value)} />
            </div>
            <div className="field span-3">
              <label htmlFor="notes">Notes</label>
              <textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
            Expense actual isn't set here — it's always the live total of the{" "}
            <a href={`/expenses?year=${year}&month=${month}`}>expense ledger</a> entries for this month.
          </p>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn-secondary btn" onClick={() => navigate(`/financials?year=${year}`)}>
              Cancel
            </button>
          </div>
        </form>
        {data?.row && (
          <button type="button" className="btn-danger btn" style={{ marginTop: "1rem" }} onClick={handleDelete}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
