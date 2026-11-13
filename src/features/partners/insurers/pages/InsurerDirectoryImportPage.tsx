import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";

interface DirectoryRow {
  index: number;
  licence_no: string | null;
  name: string;
  insurer_class: string;
  quote_email: string;
  match: { id: number; name: string; licence_no: string | null; insurer_class: string | null; quote_email: string | null } | null;
  how: "licence" | "exact" | "similar" | null;
}

interface Plan {
  rows: DirectoryRow[];
  insurers: { id: number; name: string }[];
  unmatched: { id: number; name: string }[];
}

// What happens to one directory row: "add" it as a new insurer, "skip" it, or update an existing insurer (its id).
type Choice = "add" | "skip" | number;

const HOW: Record<string, string> = { licence: "same licence no.", exact: "same name", similar: "similar name, check" };

/** Admin: load the recapitalised insurers list (licence no., class, quote email) into the insurer records. */
export function InsurerDirectoryImportPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["insurers", "directory-import"], queryFn: () => api.get<Plan>("/api/insurers/directory-import") });
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setChoices(Object.fromEntries(data.rows.map((r) => [r.index, r.match ? r.match.id : "add"])));
  }, [data]);

  if (isLoading || !data) return <p>Loading…</p>;

  const picked = Object.values(choices).filter((c): c is number => typeof c === "number");
  const twice = new Set(picked.filter((id, i) => picked.indexOf(id) !== i));
  const counts = {
    update: picked.length,
    add: Object.values(choices).filter((c) => c === "add").length,
    skip: Object.values(choices).filter((c) => c === "skip").length,
  };

  async function apply() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const body = {
        choices: Object.entries(choices).map(([index, c]) =>
          typeof c === "number" ? { index: Number(index), action: "update", insurer_id: c } : { index: Number(index), action: c },
        ),
      };
      const res = await api.post<{ updated: number; added: number }>("/api/insurers/directory-import", body);
      setDone(`Done: ${res.updated} insurer${res.updated === 1 ? "" : "s"} updated, ${res.added} added.`);
      await queryClient.invalidateQueries({ queryKey: ["insurers"] });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the directory.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow"><Link to="/insurers">Insurers</Link></p>
          <h1>Load insurer directory</h1>
          <p style={{ color: "var(--text-muted)", margin: "0.25rem 0 0", maxWidth: "48rem" }}>
            The recapitalised insurers list: licence number, class and quote request email for each insurer. Check the match on each row,
            then load. A matched insurer keeps its name and address and gets the licence number, class and quote email from the list.
          </p>
        </div>
      </div>

      {done && <div className="flash flash-success">{done}</div>}
      {error && <div className="flash flash-error">{error}</div>}

      {data.unmatched.length > 0 && (
        <div className="card">
          <p style={{ margin: 0 }}>
            <strong>Not on the list ({data.unmatched.length}):</strong> {data.unmatched.map((i) => i.name).join(", ")}. If one of these is a
            company on the list under a new name, pick it in that row below instead of "Add as new insurer".
          </p>
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Licence No.</th><th>Company</th><th>Class</th><th>Quote email</th><th>In the ERP</th></tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const c = choices[r.index] ?? "add";
                return (
                  <tr key={r.index}>
                    <td>{r.licence_no || "—"}</td>
                    <td>{r.name}</td>
                    <td>{r.insurer_class}</td>
                    <td style={{ wordBreak: "break-all" }}>{r.quote_email}</td>
                    <td>
                      <select
                        aria-label={`What to do with ${r.name}`}
                        value={String(c)}
                        onChange={(e) => {
                          const v = e.target.value;
                          setChoices((prev) => ({ ...prev, [r.index]: v === "add" || v === "skip" ? v : Number(v) }));
                        }}
                      >
                        <option value="add">Add as new insurer</option>
                        <option value="skip">Leave out</option>
                        <optgroup label="Update existing insurer">
                          {data.insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                        </optgroup>
                      </select>
                      {typeof c === "number" && r.match?.id === c && r.how && <div className="field-hint">Matched: {HOW[r.how]}</div>}
                      {typeof c === "number" && twice.has(c) && <div className="field-hint" style={{ color: "var(--status-bad, #b42318)" }}>This insurer is picked on another row too.</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={apply} disabled={busy || twice.size > 0}>
            {busy ? "Loading…" : `Load: update ${counts.update}, add ${counts.add}`}
          </button>
          <span style={{ color: "var(--text-muted)" }}>{counts.skip ? `${counts.skip} left out` : ""}</span>
        </div>
      </div>
    </div>
  );
}
