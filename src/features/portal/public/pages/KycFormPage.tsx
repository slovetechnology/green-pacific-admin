import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, apiUpload, ApiError } from "@/shared/api/client";

interface FormMeta {
  titles: string[];
  genders: string[];
  maritalStatuses: string[];
  idTypes: string[];
  proofTypes: string[];
  incomeSources: string[];
  incomeBands: string[];
  states: string[];
  classes: string[];
}

const TEXT_FIELDS = [
  "title", "surname", "first_name", "other_names", "date_of_birth", "gender", "marital_status",
  "nationality", "state_of_origin", "occupation", "employer_name", "employer_address",
  "bvn", "nin", "tin", "id_type", "id_number", "id_issue_date", "id_expiry_date",
  "phone", "phone_alt", "email", "residential_address", "residential_city", "residential_state",
  "residential_country", "proof_of_address_type", "business_address",
  "nok_name", "nok_relationship", "nok_phone", "nok_address",
  "source_of_income", "annual_income_band", "is_pep", "pep_details",
  "class_of_business", "class_of_business_other", "sum_proposed",
  "declaration_name", "declaration_date", "corporate_legal_name", "registration_number",
  "incorporation_date", "registered_address", "director_name", "director_id", "ubo_name", "ubo_ownership",
] as const;
type FieldName = (typeof TEXT_FIELDS)[number];
const CORPORATE_OWN_FIELDS: readonly FieldName[] = ["surname", "first_name", "other_names", "id_number", "id_issue_date", "business_address"];
type Values = Record<FieldName, string>;

const EMPTY: Values = Object.fromEntries(TEXT_FIELDS.map((f) => [f, ""])) as Values;

function useSignaturePad() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const drawnRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1a1a1a";

    function pos(e: MouseEvent | TouchEvent) {
      const rect = canvas!.getBoundingClientRect();
      const scaleX = canvas!.width / rect.width;
      const scaleY = canvas!.height / rect.height;
      const point = "touches" in e ? e.touches[0] : e;
      return { x: (point.clientX - rect.left) * scaleX, y: (point.clientY - rect.top) * scaleY };
    }
    function start(e: MouseEvent | TouchEvent) {
      e.preventDefault();
      drawingRef.current = true;
      const { x, y } = pos(e);
      ctx!.beginPath();
      ctx!.moveTo(x, y);
    }
    function move(e: MouseEvent | TouchEvent) {
      if (!drawingRef.current) return;
      e.preventDefault();
      const { x, y } = pos(e);
      ctx!.lineTo(x, y);
      ctx!.stroke();
      drawnRef.current = true;
    }
    function end() {
      drawingRef.current = false;
    }
    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);
    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", end);
    };
  }, []);

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawnRef.current = false;
  }

  function dataUrl(): string | null {
    if (!drawnRef.current || !canvasRef.current) return null;
    return canvasRef.current.toDataURL("image/png");
  }

  return { canvasRef, clear, dataUrl };
}

export function KycFormPage() {
  const [searchParams] = useSearchParams();
  const [customerType, setCustomerType] = useState<"individual" | "corporate">("individual");
  const [values, setValues] = useState<Values>({
    ...EMPTY,
    nationality: "Nigerian",
    residential_country: "Nigeria",
    class_of_business: searchParams.get("class") || "",
  });
  const [idDocument, setIdDocument] = useState<File | null>(null);
  const [passportPhoto, setPassportPhoto] = useState<File | null>(null);
  const [proofOfAddressDoc, setProofOfAddressDoc] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [referenceNo, setReferenceNo] = useState<string | null>(null);
  const signature = useSignaturePad();

  const metaQuery = useQuery({
    queryKey: ["kyc", "form-meta"],
    queryFn: () => api.get<FormMeta>("/api/kyc/form-meta"),
  });
  const meta = metaQuery.data;

  function set(key: FieldName, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const fd = new FormData();
      for (const f of TEXT_FIELDS) {
        // The corporate section sends these itself below; sending them here too made each an array.
        if (customerType === "corporate" && CORPORATE_OWN_FIELDS.includes(f)) continue;
        fd.append(f, values[f]);
      }
      fd.append("customer_type", customerType);
      if (customerType === "corporate") {
        fd.append("surname", values.corporate_legal_name);
        fd.append("id_number", values.registration_number);
        fd.append("id_issue_date", values.incorporation_date);
        fd.append("business_address", values.registered_address);
        fd.append("related_parties", JSON.stringify([
          values.director_name && { role: "director", name: values.director_name, identifier: values.director_id },
          values.ubo_name && { role: "ubo", name: values.ubo_name, ownershipPct: values.ubo_ownership },
        ].filter(Boolean)));
      }
      const clientId = searchParams.get("client_id");
      if (clientId) fd.append("client_id", clientId);
      const sig = signature.dataUrl();
      if (sig) fd.append("signature_data", sig);
      if (idDocument) fd.append("id_document", idDocument);
      if (passportPhoto) fd.append("passport_photo", passportPhoto);
      if (proofOfAddressDoc) fd.append("proof_of_address_doc", proofOfAddressDoc);

      const result = await apiUpload<{ referenceNo: string }>("/api/kyc", fd);
      setReferenceNo(result.referenceNo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (referenceNo) {
    return (
      <>
      <div className="container kyc-container kyc-container-complete">
        <div className="card kyc-complete">
          <img src="/logo.png" alt="Green Pacific Insurance Brokers Ltd" className="kyc-logo kyc-logo-complete" />
          <h1>Thank you</h1>
          <p className="page-lede">
            Your KYC submission has been received. Your reference number is <strong>{referenceNo}</strong>.
          </p>
          <p>Please keep this reference number for your records. Our compliance team will review your submission shortly.</p>
        </div>
      </div>
      </>
    );
  }

  return (
    <>
    <div className="container kyc-container">
      <div className="page-header">
        <div>
          <img src="/logo.png" alt="Green Pacific Insurance Brokers Ltd" className="kyc-logo" />
          <h1>Know Your Customer (KYC) Form</h1>
          <p className="page-lede">
            Required for compliance with NAICOM Know Your Customer / Anti-Money Laundering requirements
            before your insurance policy can be issued.
          </p>
        </div>
      </div>
      {error && <div className="flash flash-error">{error}</div>}

      <div className="card kyc-form-card">
        <form onSubmit={handleSubmit}>
          <div className="section-title">A. Customer Type</div>
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="customer_type">Applicant type</label>
              <select id="customer_type" value={customerType} onChange={(e) => setCustomerType(e.target.value as "individual" | "corporate")}>
                <option value="individual">Individual client</option>
                <option value="corporate">Corporate entity</option>
              </select>
            </div>
          </div>

          {customerType === "individual" ? <>
          <div className="section-title">B. Personal Details</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="title">Title</label>
              <select id="title" value={values.title} onChange={(e) => set("title", e.target.value)}>
                <option value="">— Select —</option>
                {meta?.titles.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="surname">Surname *</label>
              <input id="surname" required value={values.surname} onChange={(e) => set("surname", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="first_name">First Name *</label>
              <input id="first_name" required value={values.first_name} onChange={(e) => set("first_name", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="other_names">Other Names</label>
              <input id="other_names" value={values.other_names} onChange={(e) => set("other_names", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="date_of_birth">Date of Birth</label>
              <input id="date_of_birth" type="date" value={values.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="gender">Gender</label>
              <select id="gender" value={values.gender} onChange={(e) => set("gender", e.target.value)}>
                <option value="">— Select —</option>
                {meta?.genders.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="marital_status">Marital Status</label>
              <select id="marital_status" value={values.marital_status} onChange={(e) => set("marital_status", e.target.value)}>
                <option value="">— Select —</option>
                {meta?.maritalStatuses.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="nationality">Nationality</label>
              <input id="nationality" value={values.nationality} onChange={(e) => set("nationality", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="state_of_origin">State of Origin</label>
              <select id="state_of_origin" value={values.state_of_origin} onChange={(e) => set("state_of_origin", e.target.value)}>
                <option value="">— Select —</option>
                {meta?.states.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="occupation">Occupation</label>
              <input id="occupation" value={values.occupation} onChange={(e) => set("occupation", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="employer_name">Employer / Business Name</label>
              <input id="employer_name" value={values.employer_name} onChange={(e) => set("employer_name", e.target.value)} />
            </div>
            <div className="field span-2">
              <label htmlFor="employer_address">Employer Address</label>
              <input id="employer_address" value={values.employer_address} onChange={(e) => set("employer_address", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="bvn">Bank Verification Number (BVN)</label>
              <input id="bvn" value={values.bvn} onChange={(e) => set("bvn", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="nin">National Identity Number (NIN)</label>
              <input id="nin" value={values.nin} onChange={(e) => set("nin", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="tin">Tax Identification Number (TIN)</label>
              <input id="tin" value={values.tin} onChange={(e) => set("tin", e.target.value)} />
            </div>
          </div>
          </> : <>
          <div className="section-title">B. Corporate Entity Details</div>
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="corporate_legal_name">Registered legal name *</label>
              <input id="corporate_legal_name" required value={values.corporate_legal_name} onChange={(e) => set("corporate_legal_name", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="registration_number">Registration number *</label>
              <input id="registration_number" required value={values.registration_number} onChange={(e) => set("registration_number", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="incorporation_date">Date of incorporation</label>
              <input id="incorporation_date" type="date" value={values.incorporation_date} onChange={(e) => set("incorporation_date", e.target.value)} />
            </div>
            <div className="field span-2">
              <label htmlFor="registered_address">Registered office address *</label>
              <input id="registered_address" required value={values.registered_address} onChange={(e) => set("registered_address", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="director_name">Director / authorised officer *</label>
              <input id="director_name" required value={values.director_name} onChange={(e) => set("director_name", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="director_id">Director ID number</label>
              <input id="director_id" value={values.director_id} onChange={(e) => set("director_id", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ubo_name">Ultimate beneficial owner *</label>
              <input id="ubo_name" required value={values.ubo_name} onChange={(e) => set("ubo_name", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ubo_ownership">UBO ownership (%)</label>
              <input id="ubo_ownership" type="number" min="0" max="100" step="0.01" value={values.ubo_ownership} onChange={(e) => set("ubo_ownership", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="tin">Corporate tax identification number</label>
              <input id="tin" value={values.tin} onChange={(e) => set("tin", e.target.value)} />
            </div>
          </div>
          </>}

          <div className="section-title">C. Identification</div>
          <div className="form-grid">
            {customerType === "individual" && <div className="field">
              <label htmlFor="id_type">Means of ID</label>
              <select id="id_type" value={values.id_type} onChange={(e) => set("id_type", e.target.value)}>
                <option value="">— Select —</option>
                {meta?.idTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>}
            {customerType === "individual" && <div className="field">
              <label htmlFor="id_number">ID Number</label>
              <input id="id_number" value={values.id_number} onChange={(e) => set("id_number", e.target.value)} />
            </div>}
            {customerType === "individual" && <div className="field">
              <label htmlFor="id_issue_date">ID Issue Date</label>
              <input id="id_issue_date" type="date" value={values.id_issue_date} onChange={(e) => set("id_issue_date", e.target.value)} />
            </div>}
            {customerType === "individual" && <div className="field">
              <label htmlFor="id_expiry_date">ID Expiry Date</label>
              <input id="id_expiry_date" type="date" value={values.id_expiry_date} onChange={(e) => set("id_expiry_date", e.target.value)} />
            </div>}
            <div className="field">
              <label htmlFor="id_document">{customerType === "corporate" ? "Upload certificate of incorporation / registration" : "Upload ID Document"}</label>
              <input id="id_document" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setIdDocument(e.target.files?.[0] || null)} />
            </div>
            {customerType === "individual" && <div className="field">
              <label htmlFor="passport_photo">Upload Passport Photo</label>
              <input id="passport_photo" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setPassportPhoto(e.target.files?.[0] || null)} />
            </div>}
          </div>

          <div className="section-title">D. Contact &amp; Address</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="phone">Phone *</label>
              <input id="phone" required value={values.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="phone_alt">Alternate Phone</label>
              <input id="phone_alt" value={values.phone_alt} onChange={(e) => set("phone_alt", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={values.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="field span-2">
              <label htmlFor="residential_address">{customerType === "corporate" ? "Principal place of business" : "Residential Address"}</label>
              <input id="residential_address" value={values.residential_address} onChange={(e) => set("residential_address", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="residential_city">City</label>
              <input id="residential_city" value={values.residential_city} onChange={(e) => set("residential_city", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="residential_state">State</label>
              <select id="residential_state" value={values.residential_state} onChange={(e) => set("residential_state", e.target.value)}>
                <option value="">— Select —</option>
                {meta?.states.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="residential_country">Country</label>
              <input id="residential_country" value={values.residential_country} onChange={(e) => set("residential_country", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="proof_of_address_type">Proof of Address</label>
              <select id="proof_of_address_type" value={values.proof_of_address_type} onChange={(e) => set("proof_of_address_type", e.target.value)}>
                <option value="">— Select —</option>
                {meta?.proofTypes.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="proof_of_address_doc">Upload Proof of Address</label>
              <input id="proof_of_address_doc" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setProofOfAddressDoc(e.target.files?.[0] || null)} />
            </div>
            <div className="field span-2">
              <label htmlFor="business_address">Business Address</label>
              <input id="business_address" value={values.business_address} onChange={(e) => set("business_address", e.target.value)} />
            </div>
          </div>

          {customerType === "individual" && <><div className="section-title">E. Next of Kin</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="nok_name">Name</label>
              <input id="nok_name" value={values.nok_name} onChange={(e) => set("nok_name", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="nok_relationship">Relationship</label>
              <input id="nok_relationship" value={values.nok_relationship} onChange={(e) => set("nok_relationship", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="nok_phone">Phone</label>
              <input id="nok_phone" value={values.nok_phone} onChange={(e) => set("nok_phone", e.target.value)} />
            </div>
            <div className="field span-2">
              <label htmlFor="nok_address">Address</label>
              <input id="nok_address" value={values.nok_address} onChange={(e) => set("nok_address", e.target.value)} />
            </div>
          </div></>}

          <div className="section-title">F. Financial Profile</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="source_of_income">{customerType === "corporate" ? "Source of funds" : "Source of Income"}</label>
              <select id="source_of_income" value={values.source_of_income} onChange={(e) => set("source_of_income", e.target.value)}>
                <option value="">— Select —</option>
                {meta?.incomeSources.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="annual_income_band">{customerType === "corporate" ? "Estimated annual turnover" : "Estimated Annual Income"}</label>
              <select id="annual_income_band" value={values.annual_income_band} onChange={(e) => set("annual_income_band", e.target.value)}>
                <option value="">— Select —</option>
                {meta?.incomeBands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="is_pep">{customerType === "corporate" ? "PEP exposure among directors or UBOs?" : "Politically Exposed Person (PEP)?"}</label>
              <select id="is_pep" value={values.is_pep} onChange={(e) => set("is_pep", e.target.value)}>
                <option value="">— Select —</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>
            {values.is_pep === "Yes" && (
              <div className="field span-2">
                <label htmlFor="pep_details">PEP Details</label>
                <input id="pep_details" value={values.pep_details} onChange={(e) => set("pep_details", e.target.value)} />
              </div>
            )}
          </div>

          <div className="section-title">G. Insurance Cover</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="class_of_business">Class / Purpose of Cover</label>
              <select id="class_of_business" value={values.class_of_business} onChange={(e) => set("class_of_business", e.target.value)}>
                <option value="">— Select —</option>
                {meta?.classes.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            {values.class_of_business === "Other" && (
              <div className="field">
                <label htmlFor="class_of_business_other">Specify class</label>
                <input id="class_of_business_other" value={values.class_of_business_other} onChange={(e) => set("class_of_business_other", e.target.value)} />
              </div>
            )}
            <div className="field">
              <label htmlFor="sum_proposed">Estimated Sum Insured</label>
              <input id="sum_proposed" type="number" step="0.01" value={values.sum_proposed} onChange={(e) => set("sum_proposed", e.target.value)} />
            </div>
          </div>

          <div className="section-title">H. Declaration</div>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            I declare that the information provided above is true and accurate to the best of my knowledge.
          </p>
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="declaration_name">{customerType === "corporate" ? "Authorised representative full name *" : "Full Name (serves as your signature) *"}</label>
              <input id="declaration_name" required value={values.declaration_name} onChange={(e) => set("declaration_name", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="declaration_date">Date</label>
              <input
                id="declaration_date"
                type="date"
                value={values.declaration_date}
                onChange={(e) => set("declaration_date", e.target.value)}
              />
            </div>
          </div>
          <div className="field kyc-signature-field">
            <label>Signature (optional — draw below, or your typed name above will serve as your signature)</label>
            <canvas
              ref={signature.canvasRef}
              width={360}
              height={130}
              className="kyc-signature-canvas"
            />
            <div className="kyc-signature-actions">
              <button type="button" className="btn-secondary btn-sm" onClick={signature.clear}>
                Clear signature
              </button>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit KYC Form"}
            </button>
          </div>
        </form>
      </div>
    </div>
    </>
  );
}
