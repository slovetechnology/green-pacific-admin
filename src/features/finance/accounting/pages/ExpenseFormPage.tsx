import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { confirmAction } from "@/shared/components/ConfirmDialog";

interface FormOptions {
  categories: string[];
}

interface Expense {
  id: number;
  expense_date: string;
  category: string;
  description: string | null;
  amount: number;
  payment_method: string | null;
  reference_no: string | null;
}

const today = new Date().toISOString().slice(0, 10);

export function ExpenseFormPage() {
  const { expenseId } = useParams();
  const isEdit = Boolean(expenseId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [expenseDate, setExpenseDate] = useState(today);
  const [category, setCategory] = useState("");
  const [categoryOther, setCategoryOther] = useState("");
  const [amount, setAmount] = useState("0");
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const optionsQuery = useQuery({
    queryKey: ["expenses", "meta"],
    queryFn: () => api.get<FormOptions>("/api/expenses/meta/form-options"),
  });

  const editQuery = useQuery({
    queryKey: ["expenses", expenseId],
    queryFn: () => api.get<{ expense: Expense }>(`/api/expenses/${expenseId}`),
    enabled: isEdit,
  });

  const categories = optionsQuery.data?.categories || [];
  const isKnownCategory = useMemo(() => categories.includes(category), [categories, category]);

  useEffect(() => {
    if (isEdit && editQuery.data && categories.length) {
      const e = editQuery.data.expense;
      setExpenseDate(e.expense_date.slice(0, 10));
      setAmount(String(e.amount));
      setDescription(e.description || "");
      setPaymentMethod(e.payment_method || "");
      setReferenceNo(e.reference_no || "");
      if (categories.includes(e.category)) {
        setCategory(e.category);
      } else {
        setCategory("Other");
        setCategoryOther(e.category);
      }
    }
  }, [isEdit, editQuery.data, categories]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const payload = {
      expense_date: expenseDate, category, category_other: categoryOther,
      amount, description, payment_method: paymentMethod, reference_no: referenceNo,
    };
    try {
      if (isEdit) {
        await api.put(`/api/expenses/${expenseId}`, payload);
      } else {
        await api.post("/api/expenses", payload);
      }
      await queryClient.invalidateQueries({ queryKey: ["expenses"] });
      await queryClient.invalidateQueries({ queryKey: ["financials"] });
      navigate("/expenses");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!confirmAction("Delete this expense? This cannot be undone.")) return;
    await api.delete(`/api/expenses/${expenseId}`);
    await queryClient.invalidateQueries({ queryKey: ["expenses"] });
    await queryClient.invalidateQueries({ queryKey: ["financials"] });
    navigate("/expenses");
  }

  return (
    <div>
      <div className="page-header">
        <h1>{isEdit ? "Edit Expense" : "Log Expense"}</h1>
      </div>
      {error && <div className="flash flash-error">{error}</div>}

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="expense_date">Date</label>
              <input id="expense_date" type="date" max={today} required value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="category">Category</label>
              <select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">— Select —</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            {(category === "Other" || (!isKnownCategory && category)) && (
              <div className="field">
                <label htmlFor="category_other">Please specify</label>
                <input id="category_other" value={categoryOther} onChange={(e) => setCategoryOther(e.target.value)} />
              </div>
            )}
            <div className="field">
              <label htmlFor="amount">Amount</label>
              <input id="amount" type="number" step="0.01" min="0" required value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="field span-2">
              <label htmlFor="description">Description</label>
              <input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="payment_method">Payment method</label>
              <input id="payment_method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="reference_no">Reference no.</label>
              <input id="reference_no" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Log expense"}
            </button>
            <button type="button" className="btn-secondary btn" onClick={() => navigate("/expenses")}>
              Cancel
            </button>
          </div>
        </form>
        {isEdit && (
          <button type="button" className="btn-danger btn" style={{ marginTop: "1rem" }} onClick={handleDelete}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
