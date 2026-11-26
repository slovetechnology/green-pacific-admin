import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { RoleGate } from "@/app/guards/RoleGate";
import { fmtMoney } from "@/shared/lib/format";
import { ListSearch } from "@/shared/components/ListSearch";
import { useRowSearch } from "@/shared/hooks/useRowSearch";

interface Producer {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  monthly_quota: number;
  annual_quota: number;
  active: number;
}

export function ProducersListPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [monthlyQuota, setMonthlyQuota] = useState("0");
  const [annualQuota, setAnnualQuota] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["producers"],
    queryFn: () => api.get<{ producers: Producer[] }>("/api/producers"),
  });
  const search = useRowSearch(data?.producers, (p) => [p.name, p.email, p.phone]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/api/producers", { name, email, phone, monthly_quota: monthlyQuota, annual_quota: annualQuota });
      setName("");
      setEmail("");
      setPhone("");
      setMonthlyQuota("0");
      setAnnualQuota("0");
      await queryClient.invalidateQueries({ queryKey: ["producers"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(p: Producer) {
    await api.put(`/api/producers/${p.id}`, {
      email: p.email || "", phone: p.phone || "", monthly_quota: p.monthly_quota,
      annual_quota: p.annual_quota, active: !p.active,
    });
    await queryClient.invalidateQueries({ queryKey: ["producers"] });
  }

  const columns: DataGridColumn<Producer>[] = [
    { key: "name", header: "Name", render: (p) => <Link to={`/producers/${p.id}`}>{p.name}</Link> },
    { key: "email", header: "Email", render: (p) => p.email || "—" },
    { key: "phone", header: "Phone", render: (p) => p.phone || "—" },
    { key: "monthly_quota", header: "Monthly Quota", align: "right", render: (p) => fmtMoney(p.monthly_quota) },
    { key: "annual_quota", header: "Annual Quota", align: "right", render: (p) => fmtMoney(p.annual_quota) },
    {
      key: "status",
      header: "Status",
      render: (p) => <span className={`badge ${p.active ? "badge-paid" : "badge-cancelled"}`}>{p.active ? "Active" : "Inactive"}</span>,
    },
    {
      key: "actions",
      header: "",
      render: (p) => (
        <RoleGate need="write">
          <button type="button" className="btn-secondary btn-sm" onClick={() => toggleActive(p)}>
            {p.active ? "Deactivate" : "Reactivate"}
          </button>
        </RoleGate>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Business Development</p>
          <h1>Producer Performance</h1>
        </div>
        <RoleGate need="write">
          <div className="page-header-actions">
            <Link className="btn btn-secondary btn-sm" to="/producers/import">
              Upload producers
            </Link>
          </div>
        </RoleGate>
      </div>

      <ListSearch value={search.query} onChange={search.setQuery} placeholder="Name, email or phone…" shown={search.shown} total={search.total} />
      <DataGrid
        columns={columns}
        rows={search.filtered}
        isLoading={isLoading}
        getRowKey={(p) => p.id}
        emptyMessage="No producers on record yet."
      />

      <RoleGate need="write">
        <div className="card">
          <h2>Add Producer</h2>
          {error && <div className="flash flash-error">{error}</div>}
          <form onSubmit={handleAdd}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="name">Name</label>
                <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="phone">Phone</label>
                <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="monthly_quota">Monthly quota</label>
                <input id="monthly_quota" type="number" step="0.01" value={monthlyQuota} onChange={(e) => setMonthlyQuota(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="annual_quota">Annual quota</label>
                <input id="annual_quota" type="number" step="0.01" value={annualQuota} onChange={(e) => setAnnualQuota(e.target.value)} />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn" disabled={submitting}>Add producer</button>
            </div>
          </form>
        </div>
      </RoleGate>
    </div>
  );
}
