import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { confirmDialog } from "@/shared/components/Dialogs";

interface Testimonial {
  id: number;
  quote: string;
  author_name: string;
  author_detail: string | null;
  category: string | null;
  rating: number | null;
  photo_url: string | null;
  is_published: number;
  initials: string;
  position: number;
}
interface Pagination {
  page: number;
  total: number;
  total_pages: number;
  has_next_page: boolean;
  has_prev_page: boolean;
}
interface ListResponse {
  testimonials: Testimonial[];
  total_count: number;
  categories: string[];
  pagination: Pagination;
}

const PAGE_SIZE = 20;
const EMPTY = { quote: "", author_name: "", author_detail: "", category: "", rating: "", photo_url: "" };

// Admin-only (backend platform/testimonials). The "Customer Stories" shown on the public website (GET /api/testimonials).
export function TestimonialsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [published, setPublished] = useState("");

  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (search.trim()) params.set("search", search.trim());
  if (category) params.set("category", category);
  if (published) params.set("published", published);

  const { data, isLoading } = useQuery({
    queryKey: ["testimonials-admin", page, search.trim(), category, published],
    queryFn: () => api.get<ListResponse>(`/api/testimonials-admin?${params.toString()}`),
  });
  const pagination = data?.pagination;
  const lastPage = Math.max(1, pagination?.total_pages ?? 1);
  useEffect(() => {
    if (page > lastPage) setPage(lastPage);
  }, [page, lastPage]);

  const [form, setForm] = useState({ ...EMPTY });
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const items = data?.testimonials ?? [];
  const totalCount = data?.total_count ?? 0;
  const filtered = Boolean(search.trim() || category || published);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["testimonials-admin"] });
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function startEdit(t: Testimonial | null) {
    setError(null);
    setEditingId(t?.id ?? "new");
    setForm(
      t
        ? {
            quote: t.quote,
            author_name: t.author_name,
            author_detail: t.author_detail ?? "",
            category: t.category ?? "",
            rating: t.rating ? String(t.rating) : "",
            photo_url: t.photo_url ?? "",
          }
        : { ...EMPTY },
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (editingId === null) return;
    const ok = await run(
      () => (editingId === "new" ? api.post("/api/testimonials-admin", form) : api.put(`/api/testimonials-admin/${editingId}`, form)),
      "Could not save the testimonial.",
    );
    if (ok) setEditingId(null);
  }

  const togglePublished = (t: Testimonial) =>
    void run(() => api.put(`/api/testimonials-admin/${t.id}`, { is_published: t.is_published ? 0 : 1 }), "Could not save the change.");

  async function remove(t: Testimonial) {
    if (!(await confirmDialog(`Delete the testimonial from ${t.author_name}?`))) return;
    void run(() => api.delete(`/api/testimonials-admin/${t.id}`), "Could not delete the testimonial.");
  }

  const move = (t: Testimonial, direction: "up" | "down") =>
    void run(() => api.post(`/api/testimonials-admin/${t.id}/move`, { direction }), "Could not move it.");

  const resetPage = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Testimonials</h1>
        <button type="button" className="btn" disabled={busy} onClick={() => startEdit(null)}>Add testimonial</button>
      </div>
      {error && <div className="flash flash-error">{error}</div>}

      {editingId !== null && (
        <div className="card">
          <h2>{editingId === "new" ? "Add a testimonial" : "Edit testimonial"}</h2>
          <form onSubmit={save} className="form-grid">
            <div className="field">
              <label htmlFor="ts-name">Customer name</label>
              <input id="ts-name" value={form.author_name} maxLength={255} required placeholder="e.g. Tunde B." onChange={(e) => setForm({ ...form, author_name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="ts-detail">Shown under the name</label>
              <input id="ts-detail" value={form.author_detail} maxLength={255} placeholder="e.g. Health Insurance policyholder" onChange={(e) => setForm({ ...form, author_detail: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="ts-category">Category</label>
              <input id="ts-category" list="ts-categories" value={form.category} maxLength={120} placeholder="e.g. Health Insurance" onChange={(e) => setForm({ ...form, category: e.target.value })} />
              <datalist id="ts-categories">
                {(data?.categories ?? []).map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="ts-rating">Rating</label>
              <select id="ts-rating" value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })}>
                <option value="">No rating</option>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n > 1 ? "s" : ""}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ts-photo">Photo link</label>
              <input id="ts-photo" type="url" value={form.photo_url} maxLength={500} placeholder="https://…" onChange={(e) => setForm({ ...form, photo_url: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="ts-quote">What they said</label>
              <textarea id="ts-quote" rows={4} value={form.quote} maxLength={2000} required onChange={(e) => setForm({ ...form, quote: e.target.value })} />
            </div>
            <div className="field" style={{ justifyContent: "flex-end" }}>
              <button type="submit" className="btn" disabled={busy}>{editingId === "new" ? "Add testimonial" : "Save"}</button>{" "}
              <button type="button" className="btn-secondary btn" onClick={() => setEditingId(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="ts-search">Search</label>
            <input id="ts-search" type="search" value={search} placeholder="Name or words in the quote" onChange={(e) => resetPage(setSearch)(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ts-filter-category">Category</label>
            <select id="ts-filter-category" value={category} onChange={(e) => resetPage(setCategory)(e.target.value)}>
              <option value="">All</option>
              {(data?.categories ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ts-filter-published">Status</label>
            <select id="ts-filter-published" value={published} onChange={(e) => resetPage(setPublished)(e.target.value)}>
              <option value="">All</option>
              <option value="true">Published</option>
              <option value="false">Hidden</option>
            </select>
          </div>
        </div>
        <p>Testimonials appear on the website in this order. Hidden ones are not shown.</p>

        {isLoading ? (
          <p>Loading…</p>
        ) : items.length === 0 ? (
          <p className="muted">{filtered ? "No testimonials match these filters." : "No testimonials yet."}</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Order</th><th>Customer</th><th>Quote</th><th>Category</th><th>Rating</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td>
                    <button type="button" className="btn-secondary btn btn-sm" disabled={busy || t.position === 1} onClick={() => move(t, "up")} aria-label={`Move ${t.author_name} up`}>↑</button>{" "}
                    <button type="button" className="btn-secondary btn btn-sm" disabled={busy || t.position === totalCount} onClick={() => move(t, "down")} aria-label={`Move ${t.author_name} down`}>↓</button>
                  </td>
                  <td>
                    {t.is_published ? t.author_name : <span className="muted">{t.author_name}</span>}
                    {t.author_detail && <div className="muted">{t.author_detail}</div>}
                  </td>
                  <td title={t.quote}>{t.quote.length > 120 ? `${t.quote.slice(0, 120)}…` : t.quote}</td>
                  <td>{t.category || "—"}</td>
                  <td>{t.rating ? "★".repeat(t.rating) : "—"}</td>
                  <td>{t.is_published ? "Published" : "Hidden"}</td>
                  <td>
                    <button type="button" className="btn-secondary btn btn-sm" disabled={busy} onClick={() => startEdit(t)}>Edit</button>{" "}
                    <button type="button" className="btn-secondary btn btn-sm" disabled={busy} onClick={() => togglePublished(t)}>{t.is_published ? "Hide" : "Publish"}</button>{" "}
                    <button type="button" className="btn-secondary btn btn-sm" disabled={busy} onClick={() => remove(t)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pagination && pagination.total_pages > 1 && (
        <p>
          <button type="button" className="btn-secondary btn btn-sm" disabled={!pagination.has_prev_page} onClick={() => setPage(page - 1)}>Previous</button>{" "}
          Page {Math.min(page, lastPage)} of {lastPage} ({pagination.total} testimonials){" "}
          <button type="button" className="btn-secondary btn btn-sm" disabled={!pagination.has_next_page} onClick={() => setPage(page + 1)}>Next</button>
        </p>
      )}
    </div>
  );
}
