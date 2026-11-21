import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { saveBlob } from "@/shared/api/client";
import { engine, type Draft, type EngineRequest, type LimitChoice, type Selection, type Suggestions } from "../api/engine";
import { pb, usePbAccess, type ProductVersionDetail } from "../api/policyBank";
import { Flash, PbLayout, PbStatus, useAct } from "../components/PbCommon";
import { PolicyComponentSelector } from "../components/PolicyComponentSelector";
import { PolicyDetailsForm } from "../components/PolicyDetailsForm";
import { PolicyLimitsSelector } from "../components/PolicyLimitsSelector";
import { PolicyChanges } from "../components/PolicyChanges";
import { PolicyPreview } from "../components/PolicyPreview";
import { PolicyReview } from "../components/PolicyReview";
import { PolicyValidationPanel } from "../components/PolicyValidationPanel";
import { confirmDialog } from "@/shared/components/Dialogs";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// The groups the broker chooses from, in the order of the brief's builder; everything else is standard terms.
const CHOOSE: { title: string; hint?: string; types: string[] }[] = [
  { title: "Coverages", hint: "The perils the policy responds to.", types: ["coverage"] },
  { title: "Extensions", types: ["extension"] },
  { title: "Warranties", types: ["warranty"] },
  { title: "Clauses", types: ["clause"] },
  { title: "Endorsements", types: ["endorsement"] },
];
const STANDARD = ["definition", "insuring_clause", "exclusion", "condition", "special_condition", "claims_condition", "cancellation_condition", "renewal_condition"];

function defaultVersion(s: Suggestions | undefined): number | null {
  const pool = [...(s?.matched ?? []), ...(s?.others ?? [])];
  const first = s?.matched[0] ?? pool[0];
  if (!first) return null;
  return (first.versions.find((v) => v.approval_status === "Approved") ?? first.versions[0])?.id ?? null;
}

interface Initial { draft?: Draft; transactionId: number }

function Builder({ initial }: { initial: Initial }) {
  const navigate = useNavigate();
  const { can } = usePbAccess();
  const { draft, transactionId } = initial;

  const [draftId, setDraftId] = useState<number | null>(draft?.id ?? null);
  const [chosenPv, setChosenPv] = useState<number | null>(draft?.product_version_id ?? null);
  const [picked, setPicked] = useState<Set<string> | null>(draft?.selection?.components ? new Set(draft.selection.components) : null);
  const [limitsOn, setLimitsOn] = useState<Set<string> | null>(draft?.selection?.limits ? new Set(draft.selection.limits.map((l) => (typeof l === "string" ? l : l.code))) : null);
  const [overrides, setOverrides] = useState<Map<string, LimitChoice>>(new Map((draft?.selection?.limits ?? []).filter((l): l is LimitChoice => typeof l !== "string").map((l) => [l.code, l])));
  const [inputs, setInputs] = useState<Record<string, string>>(draft?.inputs ?? {});
  const [side, setSide] = useState<"validation" | "preview" | "changes">("validation");
  const followOn = draft?.kind === "amendment" || draft?.kind === "renewal";
  const [dirty, setDirty] = useState(false);

  const readOnly = !!draft && !["Draft", "Submitted"].includes(draft.status);

  const suggestions = useQuery({ queryKey: ["pb", "pe-products", transactionId], queryFn: () => engine.products(transactionId) });
  const pvId = chosenPv ?? defaultVersion(suggestions.data);
  const pv = useQuery({ queryKey: ["pb", "product-version", String(pvId), true], queryFn: () => pb.get<ProductVersionDetail>(`/product-versions/${pvId}?wording=1`), enabled: !!pvId });
  const ctx = useQuery({ queryKey: ["pb", "pe-context", transactionId, pvId], queryFn: () => engine.context({ transactionId, productVersionId: pvId! }), enabled: !!pvId });

  const defaults = ctx.data?.defaults;
  const components = picked ?? new Set(defaults?.components ?? []);
  const limitSet = limitsOn ?? new Set(defaults?.limits ?? []);
  const selection: Selection = {
    components: [...components],
    limits: [...limitSet].map((code) => overrides.get(code) ?? code),
  };
  const request: EngineRequest | null = pvId && defaults ? { transactionId, productVersionId: pvId, selection, inputs, forIssue: true } : null;
  const debounced = useDebounced(request, 450);
  const key = JSON.stringify(debounced);

  const validation = useQuery({
    queryKey: ["pb", "pe-validate", key],
    queryFn: () => engine.validate(debounced!),
    enabled: !!debounced,
    placeholderData: keepPreviousData,
  });
  const preview = useQuery({
    queryKey: ["pb", "pe-preview", key],
    queryFn: () => engine.preview({ ...debounced!, forIssue: false }),
    enabled: !!debounced && side === "preview",
    placeholderData: keepPreviousData,
  });
  const result = validation.data?.validation;
  // What this amendment or renewal changes against the policy it follows (from the saved draft).
  const changes = useQuery({ queryKey: ["pb", "pe-changes", draft?.id, draft?.status], queryFn: () => engine.draftChanges(draft!.id), enabled: followOn && !!draft });
  const confirm = useAct(() => engine.confirmChanges(draft!.id), () => "Changes confirmed.");
  const unconfirmed = draft?.kind === "renewal" && changes.data ? !changes.data.confirmation.confirmed : false;

  const toggle = (code: string, on: boolean) => {
    const next = new Set(components);
    if (on) next.add(code); else next.delete(code);
    setPicked(next);
    setDirty(true);
  };
  const toggleLimit = (code: string, on: boolean) => {
    const next = new Set(limitSet);
    if (on) next.add(code); else next.delete(code);
    setLimitsOn(next);
    setDirty(true);
  };
  const overrideLimit = (code: string, patch: Partial<LimitChoice>) => {
    setOverrides((m) => new Map(m).set(code, { ...(m.get(code) ?? { code }), ...patch, code }));
    setDirty(true);
  };
  const setInput = (k: string, v: string) => {
    setInputs((cur) => {
      const next = { ...cur };
      if (v === "") delete next[k]; else next[k] = v;
      return next;
    });
    setDirty(true);
  };
  const changeVersion = async (id: number) => {
    if (dirty && !(await confirmDialog("Changing the product version starts the selection again. Continue?"))) return;
    setChosenPv(id);
    setPicked(null);
    setLimitsOn(null);
    setOverrides(new Map());
    setDirty(true);
  };

  const payload = () => ({ transactionId, productVersionId: pvId!, selection: { components: selection.components, limits: selection.limits }, inputs });
  const saveNow = async (): Promise<Draft> => {
    if (!pvId) throw new Error("Choose a product version first.");
    if (draftId) return (await engine.saveDraft(draftId, payload())).draft;
    const created = (await engine.createDraft(payload())).draft;
    setDraftId(created.id);
    return created;
  };
  const save = useAct(saveNow, (d) => { setDirty(false); if (!draftId) void navigate(`/policy-bank/builder/${d.id}`, { replace: true }); return "Draft saved."; });
  const submit = useAct(async () => { const d = await saveNow(); return engine.submitDraft(d.id); }, (r) => { setDirty(false); void navigate(`/policy-bank/builder/${r.draft.id}`, { replace: true }); return "Submitted for approval."; });

  const specimen = useAct(async (format: "pdf" | "docx") => {
    const file = await engine.specimen({ ...payload(), forIssue: false }, format);
    saveBlob(file.blob, file.filename);
    return file.filename;
  }, (name) => `Downloaded ${name}.`);

  const items = pv.data?.items ?? [];
  // Placeholders used by the wordings that are in the policy, so the details form can ask for what they need.
  const inPolicy = new Set(result?.effective.components ?? [...components]);
  const usedKeys = new Set(items.filter((i) => inPolicy.has(i.code)).flatMap((i) => [...(i.wording ?? "").matchAll(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi)].map((m) => m[1].toLowerCase())));
  const byType = (types: string[]) => items.filter((i) => types.includes(i.component_type));
  const standard = byType(STANDARD);
  const productName = pv.data?.product.name;

  return (
    <div className="pb-builder">
      <div className="pb-builder-main">
        {followOn && (
          <div className="flash flash-info">
            {draft?.kind === "amendment"
              ? <>Amendment {draft.amendment_no} to policy {draft.policy_number}, effective {draft.meta?.amendment?.effectiveDate}. Reason: {draft.meta?.amendment?.reason}. Change what the amendment should change, then check the <strong>Changes</strong> tab.</>
              : <>Renewal of the previous policy, on the latest approved wording. Check the <strong>Changes</strong> tab and confirm the changes before submitting.</>}
          </div>
        )}
        <div className="card">
          <h3 className="card-title">Policy</h3>
          <dl className="pb-facts">
            <div><dt>Client</dt><dd>{suggestions.data?.transaction.client ?? "…"}</dd></div>
            <div><dt>Insurer</dt><dd>{suggestions.data?.transaction.insurer ?? "…"}</dd></div>
            <div><dt>Transaction</dt><dd><Link to={`/transactions/${transactionId}`}>{suggestions.data?.transaction.policy_no ?? `#${transactionId}`}</Link></dd></div>
            <div><dt>Class</dt><dd>{suggestions.data?.transaction.class_of_business ?? "—"}</dd></div>
            <div><dt>Period</dt><dd>{suggestions.data?.transaction.start_date ?? "—"} to {suggestions.data?.transaction.end_date ?? "—"}</dd></div>
          </dl>
          <div className="form-group" style={{ maxWidth: "32rem" }}>
            <label className="form-label" htmlFor="pb-product">Product and wording version</label>
            <select id="pb-product" className="form-control" value={pvId ?? ""} disabled={readOnly} onChange={(e) => changeVersion(Number(e.target.value))}>
              {!pvId && <option value="">No product is available for this transaction</option>}
              {suggestions.data && suggestions.data.matched.length > 0 && (
                <optgroup label="For this class of business">
                  {suggestions.data.matched.flatMap((p) => p.versions.map((v) => <option key={v.id} value={v.id}>{p.name} v{v.version} ({v.approval_status})</option>))}
                </optgroup>
              )}
              {suggestions.data && suggestions.data.others.length > 0 && (
                <optgroup label="Other products">
                  {suggestions.data.others.flatMap((p) => p.versions.map((v) => <option key={v.id} value={v.id}>{p.name} v{v.version} ({v.approval_status})</option>))}
                </optgroup>
              )}
            </select>
            {suggestions.data && suggestions.data.matched.length === 0 && pvId && <span className="pb-hint">No product is set up for “{suggestions.data.transaction.class_of_business ?? "this class"}” yet; showing all products.</span>}
          </div>
          {pv.data && pv.data.productVersion.approval_status !== "Approved" && <p className="pb-warn">This product version is {pv.data.productVersion.approval_status}, so a policy built on it cannot be issued yet.</p>}
        </div>

        {pv.isLoading && <p>Loading the product…</p>}
        {CHOOSE.map((g) => {
          const group = byType(g.types);
          return group.length ? <PolicyComponentSelector key={g.title} title={g.title} hint={g.hint} items={group} chosen={components} validation={result} onToggle={toggle} readOnly={readOnly} /> : null;
        })}
        {pv.data && <PolicyLimitsSelector limits={pv.data.limits} chosen={limitSet} overrides={overrides} validation={result} onToggle={toggleLimit} onOverride={overrideLimit} readOnly={readOnly} />}
        {standard.length > 0 && (
          <PolicyComponentSelector
            title="Standard terms" hint="Definitions, the insuring clause, exclusions and conditions. Most are mandatory."
            items={standard} chosen={components} validation={result} onToggle={toggle} collapsedByDefault readOnly={readOnly}
          />
        )}
        {ctx.data && <PolicyDetailsForm variables={ctx.data.variables} inputs={inputs} validation={result} usedKeys={usedKeys} onChange={setInput} readOnly={readOnly} />}
      </div>

      <aside className="pb-builder-side">
        <div className="card pb-actions">
          <Flash error={save.error ?? submit.error ?? specimen.error} ok={save.ok ?? submit.ok ?? specimen.ok} />
          {draft && <p className="pb-muted">Draft #{draftId} · <PbStatus status={draft.status} /></p>}
          {!readOnly && (
            <div className="pb-row-actions">
              <button type="button" className="btn-secondary btn" disabled={!pvId || save.isPending} onClick={() => save.mutate(undefined)}>{save.isPending ? "Saving…" : "Save draft"}</button>
              {can("policy_wording.generate") && <button type="button" className="btn" disabled={!pvId || submit.isPending || (result ? !result.ready : true) || unconfirmed || (followOn && dirty)} title={followOn && dirty ? "Save the draft first." : unconfirmed ? "Confirm the changes from the previous policy first." : result && !result.ready ? "Fix the problems listed below first." : undefined} onClick={() => submit.mutate(undefined)}>{submit.isPending ? "Submitting…" : "Submit for approval"}</button>}
              <button type="button" className="btn-secondary btn" disabled title="Issuing the policy document is not available yet.">Generate policy</button>
            </div>
          )}
          {pvId && (
            <div className="pb-row-actions" style={{ marginTop: "0.6rem" }}>
              <button type="button" className="btn-secondary btn" disabled={specimen.isPending} onClick={() => specimen.mutate("pdf")}>{specimen.isPending ? "Preparing…" : "Specimen PDF"}</button>
              <button type="button" className="btn-secondary btn" disabled={specimen.isPending} onClick={() => specimen.mutate("docx")}>Specimen Word</button>
            </div>
          )}
          {readOnly && <p className="pb-muted">This policy is {draft?.status.toLowerCase()} and can no longer be edited here.</p>}
          {dirty && <p className="pb-muted" style={{ marginBottom: 0 }}>You have unsaved changes.</p>}
        </div>
        <div className="pb-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={side === "validation"} className={`pb-tab${side === "validation" ? " active" : ""}`} style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => setSide("validation")}>Validation</button>
          <button type="button" role="tab" aria-selected={side === "preview"} className={`pb-tab${side === "preview" ? " active" : ""}`} style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => setSide("preview")}>Preview</button>
          {followOn && <button type="button" role="tab" aria-selected={side === "changes"} className={`pb-tab${side === "changes" ? " active" : ""}`} style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => setSide("changes")}>Changes{unconfirmed ? " (to confirm)" : ""}</button>}
        </div>
        {side === "validation" && <PolicyValidationPanel validation={result} isFetching={validation.isFetching} emptyText={suggestions.isSuccess && !pvId ? "There is no product in the Policy Bank for this transaction yet, so there is nothing to check. Add or seed products under Policy Bank > Products." : suggestions.isError ? "The products could not be loaded. Reload the page." : undefined} />}
        {side === "preview" && <PolicyPreview preview={preview.data} isLoading={preview.isLoading} productName={productName} />}
        {side === "changes" && (changes.data
          ? <PolicyChanges changes={changes.data} canConfirm={can("policy_wording.generate") && !readOnly} onConfirm={() => confirm.mutate(undefined)} confirming={confirm.isPending} unsaved={dirty} />
          : <div className="card"><p className="pb-muted">Loading the changes…</p></div>)}
        {confirm.error ? <Flash error={confirm.error} /> : null}
      </aside>
    </div>
  );
}

export function PbBuilderPage() {
  const { draftId } = useParams();
  const [params] = useSearchParams();
  const draft = useQuery({ queryKey: ["pb", "draft", draftId], queryFn: () => engine.draft(Number(draftId)), enabled: !!draftId });
  const txParam = Number(params.get("transactionId"));
  const { can } = usePbAccess();
  const edit = params.get("edit") === "1";

  const stored = draft.data?.draft;
  const reviewing = !!stored && !(can("policy_wording.generate") && (stored.status === "Draft" || (edit && ["Submitted", "Approved"].includes(stored.status))));
  let body;
  if (draftId) {
    body = draft.isLoading ? <p>Loading the draft…</p> : draft.error ? <Flash error={draft.error} /> : draft.data ? (
      // A plain draft is built; anything further along is reviewed, unless its author reopens it to edit.
      can("policy_wording.generate") && (draft.data.draft.status === "Draft" || (edit && ["Submitted", "Approved"].includes(draft.data.draft.status)))
        ? <Builder key={draft.data.draft.id} initial={{ draft: draft.data.draft, transactionId: draft.data.draft.transaction_id }} />
        : <PolicyReview key={`${draft.data.draft.id}-${draft.data.draft.status}`} draft={draft.data.draft} />
    ) : null;
  } else if (Number.isInteger(txParam) && txParam > 0) {
    body = <Builder key={`new-${txParam}`} initial={{ transactionId: txParam }} />;
  } else {
    body = <div className="card empty-state">Pick a transaction to build from on the <Link to="/policy-bank/builder">Policy builder</Link> page.</div>;
  }
  return (
    <PbLayout
      title={reviewing ? "Policy review" : "Policy wording builder"}
      intro={reviewing ? "Check the policy, approve it or send it back, and issue it once approved. An issued policy is frozen." : "Choose the product and the cover; the rules add what each choice needs, and the checks tell you what is missing before anything can be approved."}
      actions={<Link className="btn-secondary btn" to="/policy-bank/builder">← Drafts</Link>}
    >
      {body}
    </PbLayout>
  );
}

