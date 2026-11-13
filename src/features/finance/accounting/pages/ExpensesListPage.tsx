import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { RoleGate } from "@/app/guards/RoleGate";

const MONTH_OPTIONS = [
  ["1", "Jan"], ["2", "Feb"], ["3", "Mar"], ["4", "Apr"], ["5", "May"], ["6", "Jun"],
  ["7", "Jul"], ["8", "Aug"], ["9", "Sep"], ["10", "Oct"], ["11", "Nov"], ["12", "Dec"],
] as const;

interface ExpenseRow {
  id: number;
  expense_date: string;
  category: string;
  description: string | null;
  reference_no: string | null;
  amount: number;
}

interface Response {
  expenses: ExpenseRow[];
  years: string[];
  year: string;
  month: string;
  category: string;
  q: string;
  page: number;
  totalPages: number;
  total: number;
  totalAmount: number;
  categories: string[];
}

export function ExpensesListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const page = Number(searchParams.get("page") || "1");
  const year = searchParams.get("year") || "";
  const month = searchParams.get("month") || "";
  const category = searchParams.get("category") || "";
  const q = searchParams.get("q") || "";
  const [qInput, setQInput] = useState(q);

  const { data, isLoading } = useQuery({
    queryKey: ["expenses", year, month, category, q, page],
    queryFn: () =>
      api.get<Response>(
        `/api/expenses?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}&category=${encodeURIComponent(category)}&q=${encodeURIComponent(q)}&page=${page}`
      ),
  });

  function updateParams(next: Record<string, string>) {
    setSearchParams({ year, month, category, q, page: "1", ...next });
  }

  const columns: DataGridColumn<ExpenseRow>[] = [
    { key: "date", header: "Date", render: (e) => e.expense_date },
    { key: "category", header: "Category", render: (e) => e.category },
    { key: "description", header: "Description", render: (e) => e.description },
    { key: "reference", header: "Reference", render: (e) => e.reference_no },
    { key: "amount", header: "Amount", align: "right", render: (e) => fmtMoney(e.amount) },
    {
      key: "actions",
      header: "",
      render: (e) => (
        <RoleGate need="write">
          <Link to={`/expenses/${e.id}/edit`} className="btn-secondary btn-sm">
            Edit
          </Link>
        </RoleGate>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Financials</p>
          <h1>Expenses</h1>
        </div>
        <div className="page-header-actions">
          <button type="button" className="btn-secondary btn" onClick={() => navigate("/financials")}>
            Financials
          </button>
          <RoleGate need="write">
            <button type="button" className="btn-secondary btn" onClick={() => navigate("/expenses/import")}>
              Upload expenses
            </button>
            <button type="button" className="btn" onClick={() => navigate("/expenses/new")}>
              + Log Expense
            </button>
          </RoleGate>
        </div>
      </div>

      <div className="toolbar">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateParams({ q: qInput });
          }}
          style={{ display: "flex", gap: "0.5rem" }}
        >
          <input
            type="search"
            placeholder="Search description, reference…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
          <button type="submit" className="btn-secondary btn">Search</button>
        </form>
        <select value={year} onChange={(e) => updateParams({ year: e.target.value })}>
          <option value="">All years</option>
          {(data?.years || []).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select value={month} onChange={(e) => updateParams({ month: e.target.value })}>
          <option value="">All months</option>
          {MONTH_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        <select value={category} onChange={(e) => updateParams({ category: e.target.value })}>
          <option value="">All categories</option>
          {(data?.categories || []).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <DataGrid
        columns={columns}
        rows={data?.expenses}
        isLoading={isLoading}
        getRowKey={(e) => e.id}
        emptyMessage="No expenses found."
        footer={
          data && (
            <tr style={{ fontWeight: 700 }}>
              <td colSpan={4}>TOTAL ({data.total} expense{data.total === 1 ? "" : "s"})</td>
              <td className="num">{fmtMoney(data.totalAmount)}</td>
              <td></td>
            </tr>
          )
        }
        paging={
          data
            ? {
                page: data.page,
                totalPages: data.totalPages,
                total: data.total,
                onPageChange: (p) => setSearchParams({ year, month, category, q, page: String(p) }),
              }
            : undefined
        }
      />
    </div>
  );
}
