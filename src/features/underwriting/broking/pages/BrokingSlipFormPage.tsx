import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchBrokingSlipTemplates,
  fetchAutoFillData,
  fetchBrokingSlip,
  createBrokingSlip,
  updateBrokingSlip,
  resolveClauseLibrary,
  type BrokingSlipMarketShare
} from "../api/brokingSlips";
import { apiFetch } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";

interface ClientOption {
  id: number;
  name: string;
}

interface InsurerOption {
  id: number;
  name: string;
}

interface TransactionOption {
  id: number;
  policy_no: string;
  client_name?: string;
  class_of_business?: string;
}

export function BrokingSlipFormPage() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const slipId = id ? Number(id) : null;

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  // Selected parameters for pre-filling
  const [slipType, setSlipType] = useState<string>("NEW_BUSINESS");
  const [title, setTitle] = useState<string>("");
  const [clientId, setClientId] = useState<string>(searchParams.get("clientId") || "");
  const [transactionId, setTransactionId] = useState<string>(searchParams.get("transactionId") || "");
  const [submissionId, setSubmissionId] = useState<string>(searchParams.get("submissionId") || "");
  const [claimId, setClaimId] = useState<string>(searchParams.get("claimId") || "");
  const [dealId, setDealId] = useState<string>(searchParams.get("dealId") || "");
  const [insurerId, setInsurerId] = useState<string>(searchParams.get("insurerId") || "");

  const [classOfBusiness, setClassOfBusiness] = useState<string>("");
  const [product, setProduct] = useState<string>("");
  const [riskType, setRiskType] = useState<string>("");
  const [coverage, setCoverage] = useState<string>("");
  const [jurisdiction, setJurisdiction] = useState<string>("Nigeria");
  const [policyVersion, setPolicyVersion] = useState<string>("Standard");
  const [effectiveDate, setEffectiveDate] = useState<string>("");
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [sumInsured, setSumInsured] = useState<number | "">(0);
  const [limitOfLiability, setLimitOfLiability] = useState<number | "">(0);
  const [deductible, setDeductible] = useState<number | "">(0);
  const [premium, setPremium] = useState<number | "">(0);
  const [commissionRate, setCommissionRate] = useState<number | "">(0);
  const [brokerageAmount, setBrokerageAmount] = useState<number | "">(0);
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatRate, setVatRate] = useState<number | "">(7.5);
  const [registerLayout, setRegisterLayout] = useState(false);
  const [changeReason, setChangeReason] = useState<string>("");
  // broking_slip_versions.change_reason_code (appraisal slip-accuracy KPI).
  const [changeReasonCode, setChangeReasonCode] = useState<string>("");

  // Dynamic template data dictionary
  const [formData, setFormData] = useState<Record<string, any>>({});

  // Market Shares table
  const [marketShares, setMarketShares] = useState<BrokingSlipMarketShare[]>([
    { insurer_name: "", role: "Leader", written_line: 100, signed_line: 100, share_percentage: 100, premium_share: 0, status: "Signed" }
  ]);

  // Fetch Templates catalog
  const { data: templatesData } = useQuery({
    queryKey: ["brokingSlipTemplates"],
    queryFn: fetchBrokingSlipTemplates
  });

  // Entity picklists
  const { data: clientsData } = useQuery({
    queryKey: ["clientsList"],
    queryFn: () => apiFetch<{ clients: ClientOption[] }>("/api/clients/options")
  });

  const { data: insurersData } = useQuery({
    queryKey: ["insurersList"],
    queryFn: () => apiFetch<{ insurers: InsurerOption[] }>("/api/insurers/options")
  });

  const { data: transactionsData } = useQuery({
    queryKey: ["transactionsList"],
    queryFn: () => apiFetch<{ transactions: TransactionOption[] }>("/api/transactions?limit=200")
  });

  // Fetch Existing Slip if editing
  const { data: existingSlip, isLoading: isSlipLoading } = useQuery({
    queryKey: ["brokingSlip", slipId],
    queryFn: () => fetchBrokingSlip(slipId!),
    enabled: Boolean(slipId)
  });

  // Pre-fill form when editing
  useEffect(() => {
    if (existingSlip) {
      setSlipType(existingSlip.slip_type);
      setTitle(existingSlip.title);
      setClientId(existingSlip.client_id ? String(existingSlip.client_id) : "");
      setTransactionId(existingSlip.transaction_id ? String(existingSlip.transaction_id) : "");
      setSubmissionId(existingSlip.submission_id ? String(existingSlip.submission_id) : "");
      setClaimId(existingSlip.claim_id ? String(existingSlip.claim_id) : "");
      setDealId(existingSlip.deal_id ? String(existingSlip.deal_id) : "");
      setInsurerId(existingSlip.insurer_id ? String(existingSlip.insurer_id) : "");

      setClassOfBusiness(existingSlip.class_of_business || "");
      setProduct(existingSlip.product || existingSlip.data?.product || "");
      setRiskType(existingSlip.risk_type || existingSlip.data?.riskType || "");
      setCoverage(existingSlip.coverage || existingSlip.data?.coverage || "");
      setJurisdiction(existingSlip.jurisdiction || existingSlip.data?.jurisdiction || "Nigeria");
      setPolicyVersion(existingSlip.policy_version || existingSlip.data?.policyVersion || "Standard");
      setEffectiveDate(existingSlip.effective_date || "");
      setExpiryDate(existingSlip.expiry_date || "");
      setSumInsured(existingSlip.sum_insured || 0);
      setLimitOfLiability(existingSlip.limit_of_liability || 0);
      setDeductible(existingSlip.deductible || 0);
      setPremium(existingSlip.premium || 0);
      setCommissionRate(existingSlip.commission_rate || 0);
      setBrokerageAmount(existingSlip.brokerage_amount || 0);
      setVatEnabled(Boolean(existingSlip.data?.vatEnabled));
      setVatRate(existingSlip.data?.vatRate ?? 7.5);
      setRegisterLayout(Boolean(existingSlip.data?.registerLayout));

      setFormData(existingSlip.data || {});
      if (existingSlip.marketShares && existingSlip.marketShares.length > 0) {
        setMarketShares(existingSlip.marketShares);
      }
    }
  }, [existingSlip]);

  // Handle Auto-fill trigger when user selects Client or Transaction
  const handleAutoFill = async (overrideParams?: { clientId?: string; transactionId?: string; insurerId?: string }) => {
    const cId = overrideParams?.clientId !== undefined ? overrideParams.clientId : clientId;
    const tId = overrideParams?.transactionId !== undefined ? overrideParams.transactionId : transactionId;
    const iId = overrideParams?.insurerId !== undefined ? overrideParams.insurerId : insurerId;

    if (!cId && !tId && !submissionId && !claimId && !dealId && !iId) return;

    try {
      const autoData = await fetchAutoFillData({
        clientId: cId ? Number(cId) : undefined,
        transactionId: tId ? Number(tId) : undefined,
        submissionId: submissionId ? Number(submissionId) : undefined,
        claimId: claimId ? Number(claimId) : undefined,
        dealId: dealId ? Number(dealId) : undefined,
        insurerId: iId ? Number(iId) : undefined
      });

      if (autoData) {
        if (autoData.classOfBusiness) setClassOfBusiness(autoData.classOfBusiness);
        if (autoData.effectiveDate) setEffectiveDate(autoData.effectiveDate);
        if (autoData.expiryDate) setExpiryDate(autoData.expiryDate);
        if (autoData.sumInsured) setSumInsured(autoData.sumInsured);
        if (autoData.premium) setPremium(autoData.premium);
        if (autoData.commissionRate) setCommissionRate(autoData.commissionRate);

        if (autoData.clientId) setClientId(String(autoData.clientId));
        if (autoData.insurerId) setInsurerId(String(autoData.insurerId));

        setFormData(prev => ({ ...prev, ...autoData }));

        if (autoData.insurerName) {
          setMarketShares(prev => {
            if (prev.length > 0) {
              const updated = [...prev];
              updated[0] = { ...updated[0], insurer_id: autoData.insurerId, insurer_name: autoData.insurerName };
              return updated;
            }
            return [{ insurer_name: autoData.insurerName, role: "Leader", written_line: 100, signed_line: 100, share_percentage: 100, premium_share: autoData.premium || 0, status: "Signed" }];
          });
        }
      }
    } catch (err) {
      console.error("Auto fill error:", err);
    }
  };

  // Form submit mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const typeCfg = templatesData?.types[slipType];
      const finalTitle = title || typeCfg?.title || "Broking Slip";

      const payload = {
        slipType,
        title: finalTitle,
        clientId: clientId ? Number(clientId) : null,
        transactionId: transactionId ? Number(transactionId) : null,
        submissionId: submissionId ? Number(submissionId) : null,
        claimId: claimId ? Number(claimId) : null,
        dealId: dealId ? Number(dealId) : null,
        insurerId: insurerId ? Number(insurerId) : null,
        classOfBusiness,
        effectiveDate,
        expiryDate,
        sumInsured: Number(sumInsured || 0),
        limitOfLiability: Number(limitOfLiability || 0),
        deductible: Number(deductible || 0),
        premium: Number(premium || 0),
        commissionRate: Number(commissionRate || 0),
        brokerageAmount: Number(brokerageAmount || 0),
        vatEnabled,
        vatRate: Number(vatRate || 0),
        product,
        riskType,
        coverage,
        jurisdiction,
        policyVersion,
        data: { ...formData, product, riskType, coverage, jurisdiction, policyVersion, registerLayout },
        marketShares,
        changeReason: isEdit ? changeReason || "Updated broking slip" : undefined,
        changeReasonCode: isEdit ? changeReasonCode || undefined : undefined
      };

      if (isEdit && slipId) {
        return updateBrokingSlip(slipId, payload);
      } else {
        return createBrokingSlip(payload);
      }
    },
    onSuccess: (savedSlip) => {
      queryClient.invalidateQueries({ queryKey: ["brokingSlips"] });
      navigate(`/broking-slips/${savedSlip.id}`);
    }
  });

  const typeConfig = templatesData?.types || {};
  const currentTemplate = typeConfig[slipType];
  const fieldLabels = templatesData?.labels || {};
  const grossPremium = Number(premium || 0);
  const commissionAmount = grossPremium * Number(commissionRate || 0) / 100;
  const vatAmount = vatEnabled ? grossPremium * Number(vatRate || 0) / 100 : 0;
  const totalPayable = grossPremium + vatAmount;
  const netPremium = grossPremium - commissionAmount;
  const shareTotal = marketShares.reduce((total, share) => total + Number(share.share_percentage || 0), 0);

  const clausePreviewQuery = useQuery({
    queryKey: ["clauseLibraryPreview", classOfBusiness, product, riskType, coverage, insurerId, jurisdiction, policyVersion],
    queryFn: () => resolveClauseLibrary({
      classOfBusiness,
      product,
      riskType,
      coverage,
      insurerId: insurerId ? Number(insurerId) : undefined,
      jurisdiction,
      policyVersion
    }),
    enabled: Boolean(classOfBusiness || product || riskType || coverage)
  });

  const handleFieldChange = (field: string, val: any) => {
    setFormData(prev => ({ ...prev, [field]: val }));
  };

  // Market Share row helpers
  const handleAddMarketShare = () => {
    setMarketShares(prev => [
      ...prev,
      { insurer_name: "", role: "Follower", written_line: 0, signed_line: 0, share_percentage: 0, premium_share: 0, status: "Pending" }
    ]);
  };

  const handleRemoveMarketShare = (index: number) => {
    setMarketShares(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleMarketShareChange = (index: number, field: keyof BrokingSlipMarketShare, val: any) => {
    setMarketShares(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: val };
      return updated;
    });
  };

  if (isEdit && isSlipLoading) {
    return <div className="loading-container">Loading broking slip...</div>;
  }

  return (
    <div className="page-container" style={{ maxWidth: "1000px" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isEdit ? `Edit Broking Slip (${existingSlip?.slip_number})` : "Create Broking Slip"}</h1>
          <p className="page-subtitle">
            Configure Market Reform Contract (MRC), placement terms, coverage, and co-insurance lines.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-outline" onClick={() => navigate("/broking-slips")}>
            Cancel
          </button>
        </div>
      </div>

      {saveMutation.isError && (
        <div className="alert alert-danger" style={{ marginBottom: "1rem" }}>
          {(saveMutation.error as Error).message || "Failed to save broking slip"}
        </div>
      )}

      <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }}>
        {/* Template Selector & Entity Linker */}
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h3 className="card-title">1. Broking Slip Type & Entity Linking</h3>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Slip Type (14 Types)</label>
              <select
                className="form-control"
                value={slipType}
                onChange={e => {
                  setSlipType(e.target.value);
                  const newCfg = typeConfig[e.target.value];
                  if (newCfg) setTitle(newCfg.title);
                }}
                disabled={isEdit}
              >
                {Object.entries(typeConfig).map(([key, cfg]) => (
                  <option key={key} value={key}>
                    {cfg.title} [{cfg.category}]
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Custom Title (Optional)</label>
              <input
                type="text"
                className="form-control"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={currentTemplate?.title || "Broking Slip Title"}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Link Client</label>
              <select
                className="form-control"
                value={clientId}
                onChange={e => {
                  const val = e.target.value;
                  setClientId(val);
                  if (val) handleAutoFill({ clientId: val });
                }}
              >
                <option value="">-- Select Client --</option>
                {(clientsData?.clients || []).map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Link Policy / Transaction</label>
              <select
                className="form-control"
                value={transactionId}
                onChange={e => {
                  const val = e.target.value;
                  setTransactionId(val);
                  if (val) handleAutoFill({ transactionId: val });
                }}
              >
                <option value="">-- Select Transaction --</option>
                {(transactionsData?.transactions || []).map(t => (
                  <option key={t.id} value={t.id}>
                    {t.policy_no || `TX #${t.id}`} ({t.client_name || "Client"})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Lead Underwriter / Insurer</label>
              <select
                className="form-control"
                value={insurerId}
                onChange={e => {
                  const val = e.target.value;
                  setInsurerId(val);
                  if (val) handleAutoFill({ insurerId: val });
                }}
              >
                <option value="">-- Select Lead Insurer --</option>
                {(insurersData?.insurers || []).map(i => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ display: "flex", alignItems: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={() => handleAutoFill()}>
                ⚡ Auto-Fill From Linked Entities
              </button>
            </div>
          </div>
        </div>

        {/* Primary Placement Financial Terms */}
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h3 className="card-title">2. Primary Financials & Coverage Parameters</h3>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Class of Business</label>
              <input
                type="text"
                className="form-control"
                value={classOfBusiness}
                onChange={e => setClassOfBusiness(e.target.value)}
                placeholder="e.g. Fire & Special Perils, Marine Cargo, Motor"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Product</label>
              <input className="form-control" value={product} onChange={e => setProduct(e.target.value)} placeholder="e.g. Industrial All Risks" />
            </div>

            <div className="form-group">
              <label className="form-label">Risk Type</label>
              <input className="form-control" value={riskType} onChange={e => setRiskType(e.target.value)} placeholder="e.g. Manufacturing" />
            </div>

            <div className="form-group">
              <label className="form-label">Coverage</label>
              <input className="form-control" value={coverage} onChange={e => setCoverage(e.target.value)} placeholder="e.g. Fire, Theft, Liability" />
            </div>

            <div className="form-group">
              <label className="form-label">Jurisdiction</label>
              <input className="form-control" value={jurisdiction} onChange={e => setJurisdiction(e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Policy Version</label>
              <input className="form-control" value={policyVersion} onChange={e => setPolicyVersion(e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Period Start / Effective Date</label>
              <input
                type="date"
                className="form-control"
                value={effectiveDate}
                onChange={e => setEffectiveDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Period End / Expiry Date</label>
              <input
                type="date"
                className="form-control"
                value={expiryDate}
                onChange={e => setExpiryDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Sum Insured (100%)</label>
              <input
                type="number"
                className="form-control"
                value={sumInsured}
                onChange={e => setSumInsured(e.target.value ? Number(e.target.value) : "")}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Limit of Liability</label>
              <input
                type="number"
                className="form-control"
                value={limitOfLiability}
                onChange={e => setLimitOfLiability(e.target.value ? Number(e.target.value) : "")}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Deductible / Excess</label>
              <input
                type="number"
                className="form-control"
                value={deductible}
                onChange={e => setDeductible(e.target.value ? Number(e.target.value) : "")}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Gross Premium Due</label>
              <input
                type="number"
                className="form-control"
                value={premium}
                onChange={e => setPremium(e.target.value ? Number(e.target.value) : "")}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Commission / Brokerage Rate (%)</label>
              <input
                type="number"
                step="0.01"
                className="form-control"
                value={commissionRate}
                onChange={e => setCommissionRate(e.target.value ? Number(e.target.value) : "")}
              />
            </div>

            <div className="form-group">
              <label className="form-label">VAT</label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", minHeight: "38px" }}>
                <input
                  type="checkbox"
                  checked={vatEnabled}
                  onChange={e => setVatEnabled(e.target.checked)}
                />
                Apply VAT to gross premium
              </label>
            </div>

            <div className="form-group">
              <label className="form-label">PDF output</label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", minHeight: "38px" }}>
                <input
                  type="checkbox"
                  checked={registerLayout}
                  onChange={e => setRegisterLayout(e.target.checked)}
                />
                Use attached broking slip register layout
              </label>
            </div>

            {vatEnabled && (
              <div className="form-group">
                <label className="form-label">VAT Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-control"
                  value={vatRate}
                  onChange={e => setVatRate(e.target.value ? Number(e.target.value) : "")}
                />
              </div>
            )}
          </div>
          <div className="totals-card font-mono" style={{ marginTop: "1rem" }}>
            <span className="k">Gross premium</span><span className="v">{fmtMoney(grossPremium)}</span>
            {vatEnabled && <><span className="k">VAT ({Number(vatRate || 0)}%)</span><span className="v">{fmtMoney(vatAmount)}</span></>}
            {vatEnabled && <><span className="k">Total payable by insured</span><span className="v">{fmtMoney(totalPayable)}</span></>}
            <span className="k">Brokerage commission ({Number(commissionRate || 0)}%)</span><span className="v">{fmtMoney(commissionAmount)}</span>
            <span className="k grand">Net premium to insurer(s)</span><span className="v grand">{fmtMoney(netPremium)}</span>
          </div>
        </div>

        {/* Dynamic Section Accordions / Form Fields */}
        {currentTemplate?.sections && (
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <h3 className="card-title">3. Template Detailed Sections</h3>
            {currentTemplate.sections.map(([secKey, secTitle, fields]) => (
              <div key={secKey} style={{ marginBottom: "1.5rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "1rem" }}>
                <h4 style={{ color: "var(--primary-color)", marginBottom: "0.75rem", fontSize: "0.95rem" }}>{secTitle}</h4>
                <div className="form-grid">
                  {fields.map(field => {
                    const label = fieldLabels[field] || field;
                    const val = formData[field] ?? "";
                    const isTextArea = ["riskDescription", "propertyDetails", "warranties", "clauses", "exclusions", "subjectivities", "brokerInstruction", "incidentDescription", "remarks", "clientComments"].includes(field);

                    return (
                      <div key={field} className={isTextArea ? "form-group col-span-2" : "form-group"}>
                        <label className="form-label">{label}</label>
                        {isTextArea ? (
                          <textarea
                            className="form-control"
                            rows={3}
                            value={val}
                            onChange={e => handleFieldChange(field, e.target.value)}
                          />
                        ) : (
                          <input
                            type="text"
                            className="form-control"
                            value={val}
                            onChange={e => handleFieldChange(field, e.target.value)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h3 className="card-title">Clause Library Resolution</h3>
          <p className="page-subtitle">The saved slip carries the versioned wording selected by this risk context.</p>
          {clausePreviewQuery.isLoading && <p>Resolving library entries...</p>}
          {!clausePreviewQuery.isLoading && (clausePreviewQuery.data?.entries.length || 0) === 0 && <p>No active library entries match this context yet.</p>}
          {(clausePreviewQuery.data?.entries || []).map(entry => (
            <div key={entry.id} style={{ marginBottom: "0.75rem" }}>
              <strong>
                {entry.clauseType} · {entry.code} · {entry.title}
                {entry.isMandatory && (
                  <span style={{ marginLeft: "0.5rem", color: "var(--status-critical)", fontSize: "0.75rem" }}>
                    MANDATORY
                  </span>
                )}
              </strong>
              <div>{entry.wording}</div>
            </div>
          ))}
        </div>

        {/* Co-Insurance / Reinsurance Market Placement Shares Grid */}
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 className="card-title" style={{ margin: 0 }}>4. Market Reform Subscription & Underwriter Shares</h3>
            <button type="button" className="btn btn-sm btn-outline" onClick={handleAddMarketShare}>
              + Add Underwriter / Co-Insurer
            </button>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Underwriter / Insurer Name</th>
                  <th>Role</th>
                  <th>Written %</th>
                  <th>Signed %</th>
                  <th>Premium Share</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Remove</th>
                </tr>
              </thead>
              <tbody>
                {marketShares.map((share, idx) => (
                  <tr key={idx}>
                    <td>
                      <input
                        type="text"
                        className="form-control"
                        value={share.insurer_name}
                        onChange={e => handleMarketShareChange(idx, "insurer_name", e.target.value)}
                        placeholder="e.g. Leadway Assurance"
                      />
                    </td>
                    <td>
                      <select
                        className="form-control"
                        value={share.role}
                        onChange={e => handleMarketShareChange(idx, "role", e.target.value as any)}
                      >
                        <option value="Leader">Leader</option>
                        <option value="Follower">Follower</option>
                        <option value="Co-Insurer">Co-Insurer</option>
                        <option value="Reinsurer">Reinsurer</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        className="form-control font-mono"
                        value={share.written_line}
                        onChange={e => handleMarketShareChange(idx, "written_line", Number(e.target.value))}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        className="form-control font-mono"
                        value={share.signed_line}
                        onChange={e => handleMarketShareChange(idx, "signed_line", Number(e.target.value))}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="form-control font-mono"
                        value={share.premium_share}
                        onChange={e => handleMarketShareChange(idx, "premium_share", Number(e.target.value))}
                      />
                    </td>
                    <td>
                      <select
                        className="form-control"
                        value={share.status}
                        onChange={e => handleMarketShareChange(idx, "status", e.target.value as any)}
                      >
                        <option value="Pending">Pending</option>
                        <option value="Written">Written</option>
                        <option value="Signed">Signed</option>
                        <option value="Declined">Declined</option>
                      </select>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => handleRemoveMarketShare(idx)}
                        disabled={marketShares.length === 1}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: "0.75rem", fontWeight: 600, color: Math.abs(shareTotal - 100) < 0.01 ? "var(--status-good)" : "var(--status-critical)" }}>
            Participation total: {shareTotal.toFixed(2)}%
            {Math.abs(shareTotal - 100) >= 0.01 && " (adjust lines to total 100% before placement)"}
          </div>
        </div>

        {/* Audit Version Change Reason if editing */}
        {isEdit && (
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <h3 className="card-title">5. Version History Notes</h3>
            <div className="form-group">
              <label className="form-label" htmlFor="change-reason-code">What kind of change is this?</label>
              <select id="change-reason-code" className="form-control" value={changeReasonCode} onChange={e => setChangeReasonCode(e.target.value)} required>
                <option value="">Choose…</option>
                <option value="Correction">Correction of an error in the slip</option>
                <option value="Client change">Client asked for a change</option>
                <option value="Market change">Market or insurer asked for a change</option>
              </select>
              <small style={{ color: "var(--text-muted)" }}>Corrections count against the preparer's slip-accuracy KPI.</small>
            </div>
            <div className="form-group">
              <label className="form-label">Reason for Revision / Change Note</label>
              <input
                type="text"
                className="form-control"
                value={changeReason}
                onChange={e => setChangeReason(e.target.value)}
                placeholder="Describe what was modified in this version..."
              />
            </div>
          </div>
        )}

        {/* Submit Actions */}
        <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-outline" onClick={() => navigate("/broking-slips")}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : isEdit ? "Save & Create New Version" : "Generate Broking Slip"}
          </button>
        </div>
      </form>
    </div>
  );
}
