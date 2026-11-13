import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchBrokingSlip, fetchPlacement, updateBrokingSlip, type ClauseGroup, type PlacementPayload } from "../api/brokingSlips";
import { NIGERIA_LGAS, NIGERIA_STATES, matchState } from "@/shared/lib/nigeriaLocations";
import "@/shared/styles/placement.css";

type Currency = "NGN" | "USD";

interface WorkingClause {
  key: string;
  code: string;
  title: string;
  group: ClauseGroup;
  wording: string;
  mandatory: boolean;
  custom: boolean;
}

const SCALE = 10_000n; // rates carry four decimal places

const toCents = (value: number) => BigInt(Math.round((Number.isFinite(value) && value > 0 ? value : 0) * 100));
const toScaled = (rate: number) => BigInt(Math.round((Number.isFinite(rate) && rate > 0 ? rate : 0) * Number(SCALE)));
// amount x (rate / 100), rounded half up; every input is clamped to zero or more.
const applyRate = (cents: bigint, scaled: bigint) => (cents * scaled + (SCALE * 100n) / 2n) / (SCALE * 100n);

function formatCents(cents: bigint, currency: Currency, fxRate: number): string {
  const naira = Number(cents) / 100;
  const amount = currency === "USD" ? naira / fxRate : naira;
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

const GROUPS: { group: ClauseGroup; heading: string }[] = [
  { group: "Clause", heading: "Clauses" },
  { group: "Warranty", heading: "Warranties" },
  { group: "Endorsement", heading: "Endorsements" },
];

const ID_TYPES = ["NIN", "BVN", "Passport", "Driver's Licence", "Voter's Card"];

const clausesOf = (payload: PlacementPayload): WorkingClause[] =>
  payload.placement.clauses.map((c, i) => ({ ...c, key: `clause-${i}` }));

export function PlacementSlipPage() {
  const { id } = useParams<{ id: string }>();
  const slipId = Number(id);
  const { data: slip, isLoading, isError } = useQuery({
    queryKey: ["brokingSlip", slipId],
    queryFn: () => fetchBrokingSlip(slipId),
    enabled: !isNaN(slipId),
  });
  const { data: payload } = useQuery({
    queryKey: ["brokingSlipPlacement", slipId],
    queryFn: () => fetchPlacement(slipId),
    enabled: !isNaN(slipId),
  });

  const [sumInsured, setSumInsured] = useState(0);
  const [premiumRate, setPremiumRate] = useState(0);
  const [brokerageRate, setBrokerageRate] = useState(0);
  const [currency, setCurrency] = useState<Currency>("NGN");
  const [fxRate, setFxRate] = useState(0);
  const [kyc, setKyc] = useState({ clientType: "", rcNumber: "", idType: "", idNumber: "", tin: "", street: "", businessCategory: "" });
  const [place, setPlace] = useState({ state: "", lga: "", city: "" });
  const [changeCode, setChangeCode] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const queryClient = useQueryClient();
  const [clauses, setClauses] = useState<WorkingClause[]>([]);

  // Start from the saved slip. Everything below is a working copy; nothing is written back.
  useEffect(() => {
    if (!slip) return;
    const si = Number(slip.sum_insured) || 0;
    setSumInsured(si);
    setPremiumRate(
      slip.data?.premiumRate != null
        ? Number(slip.data.premiumRate)
        : si > 0 ? Math.round((Number(slip.premium) / si) * 1_000_000) / 10_000 : 0,
    );
    setBrokerageRate(Number(slip.commission_rate) || 0);
    if (!payload) return;
    const { client } = payload.placement;
    setKyc({
      clientType: client.type,
      rcNumber: client.rcNumber,
      idType: client.idType,
      idNumber: client.idNumber,
      tin: client.tin,
      street: client.address.street,
      businessCategory: client.businessCategory,
    });
    const state = matchState(client.address.state);
    setPlace({ state, lga: NIGERIA_LGAS[state]?.includes(client.address.lga) ? client.address.lga : "", city: client.address.city });
    setClauses(clausesOf(payload));
  }, [slip, payload]);

  const figures = useMemo(() => {
    const gross = applyRate(toCents(sumInsured), toScaled(premiumRate));
    const brokerage = applyRate(gross, toScaled(brokerageRate));
    return { gross, brokerage, net: gross - brokerage };
  }, [sumInsured, premiumRate, brokerageRate]);

  const save = useMutation({
    mutationFn: () =>
      updateBrokingSlip(slipId, {
        sumInsured,
        premium: Number(figures.gross) / 100,
        commissionRate: brokerageRate,
        brokerageAmount: Number(figures.brokerage) / 100,
        changeReason: changeNote || "Updated from placement view",
        changeReasonCode: changeCode,
        data: {
          premiumRate,
          clientType: kyc.clientType,
          rcNumber: kyc.clientType === "Corporate" ? kyc.rcNumber : "",
          idType: kyc.clientType === "Individual" ? kyc.idType : "",
          idNumber: kyc.clientType === "Individual" ? kyc.idNumber : "",
          tin: kyc.tin,
          street: kyc.street,
          businessCategory: kyc.businessCategory,
          state: place.state,
          lga: place.lga,
          city: place.city,
          placementClauses: clauses.map(({ code, title, group, wording, mandatory, custom }) => ({ code, title, group, wording, mandatory, custom })),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brokingSlip", slipId] });
      queryClient.invalidateQueries({ queryKey: ["brokingSlipPlacement", slipId] });
      queryClient.invalidateQueries({ queryKey: ["brokingSlips"] });
    },
  });

  if (isLoading || (slip && !payload)) return <div className="loading-container">Loading placement slip...</div>;
  if (isError || !slip || !payload) return <div className="alert alert-danger">Broking slip not found.</div>;
  const { broker, insurer } = payload.placement;

  const usdBlocked = currency === "USD" && !(fxRate > 0);
  const money = (cents: bigint) => (usdBlocked ? "Enter FX rate" : formatCents(cents, currency, fxRate));
  const address = [kyc.street, place.city, place.lga, place.state].filter(Boolean).join(", ");

  const patchClause = (key: string, patch: Partial<WorkingClause>) =>
    setClauses((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const removeClause = (c: WorkingClause) => {
    if (c.mandatory && !window.confirm(`"${c.title}" is a mandatory clause for this class. Remove it from this slip anyway?`)) return;
    setClauses((list) => list.filter((x) => x.key !== c.key));
  };
  const addClause = (group: ClauseGroup) =>
    setClauses((list) => [
      ...list,
      { key: `custom-${Date.now()}`, code: "CUSTOM", title: "", group, wording: "", mandatory: false, custom: true },
    ]);

  return (
    <div className="placement">
      <div className="page-header no-print">
        <div>
          <p className="eyebrow">Placement Broking Slip</p>
          <h1>{slip.slip_number}</h1>
          <p className="page-subtitle">
            Edits here are saved to this slip as a new version when you press Save. The clause library itself is never changed.
          </p>
        </div>
        <div className="page-actions" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link to={`/broking-slips/${slip.id}`} className="btn btn-outline">Back to slip</Link>
          <Link to={`/broking-slips/${slip.id}/edit`} className="btn btn-outline">Edit slip</Link>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print</button>
        </div>
      </div>

      <div className="placement-print-ref">
        Broking Slip Reference: <strong>{slip.slip_number}</strong> (v{slip.version})
        <div>{broker.name} · NAICOM Licence {broker.naicomRegistrationNo} · {broker.rcNumber} · {broker.address}</div>
      </div>

      {payload.issues.length > 0 && (
        <div className="placement-issues no-print" role="status">
          <strong>Before this slip goes to market ({payload.issues.length} to complete, from the last saved version):</strong>
          <ul>
            {payload.issues.map((issue) => <li key={issue.field}>{issue.message}</li>)}
          </ul>
        </div>
      )}

      <div className="placement-statutory" role="alert">
        <strong>STATUTORY NOTICE: NO PREMIUM, NO COVER</strong>
        <p>
          Under Section 50 of the Insurance Act 2003, no insurance cover is effective and no claim is payable unless the premium
          has been paid to the insurer on or before the inception or renewal date. The broker cannot bind cover for premium it has
          not collected.
        </p>
      </div>

      <div className="placement-split">
        <div className="card">
          <h3 className="card-title">Placement details</h3>
          <dl className="placement-facts">
            <dt>Class of business</dt><dd>{slip.class_of_business || "—"}</dd>
            <dt>Period of insurance</dt><dd>{slip.effective_date || "TBA"} to {slip.expiry_date || "TBA"}</dd>
            <dt>Broker</dt><dd>{broker.name}, NAICOM Licence {broker.naicomRegistrationNo}</dd>
            <dt>Insurer</dt><dd>{insurer.name || "Market subscription"}</dd>
            <dt>Underwriter</dt><dd>{insurer.underwriter || "—"}</dd>
            <dt>Allocation</dt><dd>{insurer.participationPercent}%</dd>
            <dt>Deductible / excess</dt><dd>{Number(slip.deductible) > 0 ? formatCents(toCents(slip.deductible), "NGN", 1) : "—"}</dd>
          </dl>
        </div>
        <div className="card">
          <h3 className="card-title">Insured (KYC)</h3>
          <dl className="placement-facts">
            <dt>Legal name</dt><dd>{slip.client_name || "—"}</dd>
            <dt>Address</dt><dd>{address || "—"}</dd>
          </dl>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="pl-type">Client type</label>
              <select id="pl-type" value={kyc.clientType} onChange={(e) => setKyc({ ...kyc, clientType: e.target.value })}>
                <option value="">Select type</option>
                <option value="Individual">Individual</option>
                <option value="Corporate">Corporate</option>
              </select>
            </div>
            {kyc.clientType === "Corporate" && (
              <div className="field">
                <label htmlFor="pl-rc">RC number (CAC)</label>
                <input id="pl-rc" value={kyc.rcNumber} onChange={(e) => setKyc({ ...kyc, rcNumber: e.target.value })} />
              </div>
            )}
            {kyc.clientType === "Individual" && (
              <>
                <div className="field">
                  <label htmlFor="pl-idtype">ID type</label>
                  <select id="pl-idtype" value={kyc.idType} onChange={(e) => setKyc({ ...kyc, idType: e.target.value })}>
                    <option value="">Select ID type</option>
                    {ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="pl-idnum">ID number</label>
                  <input id="pl-idnum" value={kyc.idNumber} onChange={(e) => setKyc({ ...kyc, idNumber: e.target.value })} />
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="pl-tin">TIN (FIRS)</label>
              <input id="pl-tin" value={kyc.tin} onChange={(e) => setKyc({ ...kyc, tin: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="pl-biz">Business / occupation</label>
              <input id="pl-biz" value={kyc.businessCategory} onChange={(e) => setKyc({ ...kyc, businessCategory: e.target.value })} />
            </div>
            <div className="field span-2">
              <label htmlFor="pl-street">Risk location: street</label>
              <input id="pl-street" value={kyc.street} onChange={(e) => setKyc({ ...kyc, street: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="pl-state">State</label>
              <select id="pl-state" value={place.state} onChange={(e) => setPlace({ ...place, state: e.target.value, lga: "" })}>
                <option value="">Select state</option>
                {NIGERIA_STATES.map((st) => <option key={st} value={st}>{st}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pl-lga">Local government area</label>
              <select id="pl-lga" value={place.lga} disabled={!place.state} onChange={(e) => setPlace({ ...place, lga: e.target.value })}>
                <option value="">{place.state ? "Select LGA" : "Select a state first"}</option>
                {(NIGERIA_LGAS[place.state] ?? []).map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pl-city">City / town</label>
              <input id="pl-city" value={place.city} onChange={(e) => setPlace({ ...place, city: e.target.value })} />
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="placement-toolbar no-print">
          <h3 className="card-title" style={{ margin: 0 }}>Risk and premium</h3>
          <div className="placement-currency">
            <div role="group" aria-label="Currency">
              {(["NGN", "USD"] as Currency[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={currency === c ? "btn btn-sm" : "btn-secondary btn-sm"}
                  aria-pressed={currency === c}
                  onClick={() => setCurrency(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            {currency === "USD" && (
              <label>
                NGN per USD{" "}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={fxRate || ""}
                  onChange={(e) => setFxRate(Number(e.target.value))}
                  style={{ width: "7rem" }}
                />
              </label>
            )}
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="num">Sum insured (₦)</th>
                <th className="num">Premium rate (%)</th>
                <th className="num">Gross premium</th>
                <th className="num">Brokerage rate (%)</th>
                <th className="num">Brokerage earned</th>
                <th className="num">Net premium payable</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <input type="number" min="0" step="0.01" value={sumInsured} aria-label="Sum insured in naira"
                    onChange={(e) => setSumInsured(Number(e.target.value))} />
                </td>
                <td>
                  <input type="number" min="0" step="0.0001" value={premiumRate} aria-label="Premium rate percent"
                    onChange={(e) => setPremiumRate(Number(e.target.value))} />
                </td>
                <td className="num">{money(figures.gross)}</td>
                <td>
                  <input type="number" min="0" max="100" step="0.01" value={brokerageRate} aria-label="Brokerage rate percent"
                    onChange={(e) => setBrokerageRate(Number(e.target.value))} />
                </td>
                <td className="num">{money(figures.brokerage)}</td>
                <td className="num"><strong>{money(figures.net)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="placement-note">
          Gross premium = sum insured × rate ÷ 100. Brokerage = gross × brokerage rate ÷ 100. Net premium = gross − brokerage.
          Amounts are worked in kobo and rounded half up. The sum insured is always entered in naira; the USD view only converts
          what is displayed. Class commission caps are checked when the policy is saved, not here.
        </p>
      </div>

      {GROUPS.map(({ group, heading }) => {
        const items = clauses.filter((c) => c.group === group);
        return (
          <div key={group} className="card">
            <div className="placement-toolbar">
              <h3 className="card-title" style={{ margin: 0 }}>{heading}</h3>
              <button type="button" className="btn btn-sm btn-outline no-print" onClick={() => addClause(group)}>
                + Add {group.toLowerCase()}
              </button>
            </div>
            {items.length === 0 && <p className="text-muted">None attached to this slip.</p>}
            {items.map((c) => (
              <div key={c.key} className="placement-clause">
                <div className="placement-clause-head">
                  {c.custom ? (
                    <input
                      className="placement-clause-title"
                      placeholder={`${group} title`}
                      aria-label={`${group} title`}
                      value={c.title}
                      onChange={(e) => patchClause(c.key, { title: e.target.value })}
                    />
                  ) : (
                    <strong>{c.code} · {c.title}</strong>
                  )}
                  {c.mandatory && <span className="placement-mandatory">MANDATORY</span>}
                  <button type="button" className="btn-secondary btn-sm no-print" onClick={() => removeClause(c)}>Remove</button>
                </div>
                <textarea
                  rows={4}
                  aria-label={`Wording for ${c.title || `new ${group.toLowerCase()}`}`}
                  value={c.wording}
                  onChange={(e) => patchClause(c.key, { wording: e.target.value })}
                />
              </div>
            ))}
          </div>
        );
      })}

      <div className="card no-print">
        <h3 className="card-title">Save to slip</h3>
        {save.isError && <div className="flash flash-error">{(save.error as Error).message || "Could not save the slip."}</div>}
        {save.isSuccess && <div className="flash flash-success">Saved as version {save.data.version}.</div>}
        <div className="form-grid">
          <div className="field">
            <label htmlFor="pl-code">What kind of change is this?</label>
            <select id="pl-code" value={changeCode} onChange={(e) => setChangeCode(e.target.value)}>
              <option value="">Choose…</option>
              <option value="Correction">Correction of an error in the slip</option>
              <option value="Client change">Client asked for a change</option>
              <option value="Market change">Market or insurer asked for a change</option>
            </select>
          </div>
          <div className="field span-2">
            <label htmlFor="pl-note">Note for the version history</label>
            <input id="pl-note" value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" disabled={!changeCode || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save to slip"}
          </button>
        </div>
      </div>
    </div>
  );
}
