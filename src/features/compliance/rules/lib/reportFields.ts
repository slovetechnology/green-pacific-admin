// Field definitions for the manual-entry report types.
//
// MPR, MCR and MIF are derived from the business tables and get their own
// dedicated line-table editors. The other 15 types have no source table
// and no server-side payload schema — normalizePayload() in the backend
// lib passes their bodies through untouched — so what they need is a
// structured capture form rather than the reference module's raw JSON
// editor.
//
// The fields below come from the "Key Data Points" column of
// modules/naicom-reports/INTEGRATION_GUIDE.md, which is the regulatory
// source material for this module. Because there is no server-side schema
// for these, nothing here is enforced on submit beyond the broker-profile
// checks every report shares: treat them as the capture sheet NAICOM asks
// for, not as validated data.

export type FieldKind = "text" | "number" | "money" | "date" | "textarea" | "check";

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  hint?: string;
}

export interface FieldGroup {
  title: string;
  fields: FieldDef[];
}

const AML_ACTIVITY: FieldDef[] = [
  { key: "cddConducted", label: "CDD / KYC checks conducted", kind: "number" },
  { key: "pepScreens", label: "PEP screens performed", kind: "number" },
  { key: "pepMatches", label: "PEP matches escalated", kind: "number" },
  { key: "strsFiled", label: "Suspicious Transaction Reports filed", kind: "number" },
  { key: "nfiuReference", label: "NFIU filing reference(s)", kind: "text" },
];

export const REPORT_FIELDS: Record<string, FieldGroup[]> = {
  MBS: [
    {
      title: "Broking activity",
      fields: [
        { key: "policiesPlaced", label: "Policies placed", kind: "number" },
        { key: "policiesRenewed", label: "Policies renewed", kind: "number" },
        { key: "policiesLapsed", label: "Policies lapsed", kind: "number" },
        { key: "newClients", label: "New clients onboarded", kind: "number" },
        { key: "activeClients", label: "Active clients at period end", kind: "number" },
        { key: "classBreakdown", label: "Breakdown by class of business", kind: "textarea" },
      ],
    },
  ],
  MAML: [
    { title: "AML/CFT activity", fields: AML_ACTIVITY },
    {
      title: "Narrative",
      fields: [{ key: "remarks", label: "Remarks", kind: "textarea" }],
    },
  ],
  BPCR: [
    {
      title: "Portfolio movement",
      fields: [
        { key: "openingPolicyCount", label: "Policies at period start", kind: "number" },
        { key: "policiesAdded", label: "Policies added", kind: "number" },
        { key: "policiesLapsed", label: "Policies lapsed / not renewed", kind: "number" },
        { key: "closingPolicyCount", label: "Policies at period end", kind: "number" },
        { key: "renewalRate", label: "Renewal rate (%)", kind: "number" },
        { key: "classSplit", label: "Split by class of business", kind: "textarea" },
      ],
    },
  ],
  BRSR: [
    {
      title: "Risk surveys",
      fields: [
        { key: "surveysConducted", label: "Surveys conducted", kind: "number" },
        { key: "sitesVisited", label: "Sites visited", kind: "number" },
        { key: "highRiskFindings", label: "High-risk findings", kind: "number" },
        { key: "findingsSummary", label: "Summary of findings", kind: "textarea" },
        { key: "recommendations", label: "Recommendations issued", kind: "textarea" },
      ],
    },
  ],
  QFR: [
    {
      title: "Income",
      fields: [
        { key: "brokerageIncome", label: "Brokerage income", kind: "money" },
        { key: "otherIncome", label: "Other income", kind: "money" },
      ],
    },
    {
      title: "Expenditure",
      fields: [
        { key: "operatingExpenses", label: "Operating expenses", kind: "money" },
        { key: "staffCosts", label: "Staff costs", kind: "money" },
      ],
    },
    {
      title: "Capital adequacy",
      fields: [
        {
          key: "shareholdersFunds",
          label: "Shareholders' funds",
          kind: "money",
          hint: "Checked against the NIIRA 2025 minimum for the licence category.",
        },
        { key: "paidUpCapital", label: "Paid-up capital", kind: "money" },
        { key: "currentAssets", label: "Current assets", kind: "money" },
        { key: "currentLiabilities", label: "Current liabilities", kind: "money" },
      ],
    },
    {
      title: "Professional indemnity",
      fields: [
        { key: "piInsurer", label: "PI cover insurer", kind: "text" },
        { key: "piSumInsured", label: "PI sum insured", kind: "money" },
        { key: "piExpiryDate", label: "PI cover expiry", kind: "date" },
      ],
    },
  ],
  QBR: [
    {
      title: "Placements",
      fields: [
        { key: "totalPlacements", label: "Total placements", kind: "number" },
        { key: "localPremium", label: "Premium placed locally", kind: "money" },
        { key: "offshorePremium", label: "Premium placed offshore", kind: "money" },
        {
          key: "localContentPercentage",
          label: "Local content (%)",
          kind: "number",
          hint: "NAICOM's Local Content Policy expects at least 70%.",
        },
        { key: "insurerSplit", label: "Split by insurer", kind: "textarea" },
        { key: "naicomApprovals", label: "NAICOM approval references for offshore placements", kind: "textarea" },
      ],
    },
  ],
  QCMR: [
    {
      title: "Claims performance",
      fields: [
        { key: "claimsNotified", label: "Claims notified", kind: "number" },
        { key: "claimsSettled", label: "Claims settled", kind: "number" },
        { key: "claimsOutstanding", label: "Claims outstanding at period end", kind: "number" },
        { key: "claimsRepudiated", label: "Claims repudiated", kind: "number" },
        { key: "settlementRate", label: "Settlement rate (%)", kind: "number" },
        { key: "averageSettlementDays", label: "Average days to settle", kind: "number" },
      ],
    },
    {
      title: "Complaints",
      fields: [
        { key: "complaintsReceived", label: "Complaints received", kind: "number" },
        { key: "complaintsResolved", label: "Complaints resolved", kind: "number" },
        { key: "complaintsSummary", label: "Complaints summary", kind: "textarea" },
      ],
    },
  ],
  QGR: [
    {
      title: "Board and governance",
      fields: [
        { key: "boardMeetingsHeld", label: "Board meetings held", kind: "number" },
        { key: "averageAttendance", label: "Average attendance (%)", kind: "number" },
        { key: "complianceOfficer", label: "Compliance officer", kind: "text" },
        { key: "staffStrength", label: "Staff strength", kind: "number" },
        { key: "qualifiedStaff", label: "Professionally qualified staff", kind: "number" },
        { key: "governanceIssues", label: "Governance issues arising", kind: "textarea" },
      ],
    },
  ],
  QAML: [
    { title: "AML/CFT activity", fields: AML_ACTIVITY },
    {
      title: "Compliance programme",
      fields: [
        { key: "ctrsFiled", label: "Currency Transaction Reports filed", kind: "number" },
        { key: "trainingHours", label: "AML/CFT training hours delivered", kind: "number" },
        { key: "staffTrained", label: "Staff trained", kind: "number" },
        { key: "riskRating", label: "Institutional risk rating", kind: "text" },
        { key: "riskAssessmentDate", label: "Last risk assessment", kind: "date" },
      ],
    },
  ],
  AAR: [
    {
      title: "Annual summary",
      fields: [
        { key: "grossPremiumPlaced", label: "Gross premium placed", kind: "money" },
        { key: "brokerageEarned", label: "Brokerage earned", kind: "money" },
        { key: "clientsServed", label: "Clients served", kind: "number" },
        { key: "marketPenetration", label: "Market penetration commentary", kind: "textarea" },
        { key: "strategicOutlook", label: "Strategic outlook", kind: "textarea" },
      ],
    },
  ],
  AFS: [
    {
      title: "Statement of financial position",
      fields: [
        { key: "totalAssets", label: "Total assets", kind: "money" },
        { key: "totalLiabilities", label: "Total liabilities", kind: "money" },
        { key: "shareholdersFunds", label: "Shareholders' funds", kind: "money" },
        { key: "paidUpCapital", label: "Paid-up capital", kind: "money" },
      ],
    },
    {
      title: "Statement of profit or loss",
      fields: [
        { key: "revenue", label: "Revenue", kind: "money" },
        { key: "operatingExpenses", label: "Operating expenses", kind: "money" },
        { key: "profitBeforeTax", label: "Profit before tax", kind: "money" },
      ],
    },
    {
      title: "Audit",
      fields: [
        { key: "auditFirm", label: "Audit firm", kind: "text" },
        { key: "auditOpinion", label: "Audit opinion", kind: "text" },
        { key: "dateSigned", label: "Date signed off", kind: "date" },
      ],
    },
  ],
  AHR: [
    {
      title: "Staffing",
      fields: [
        { key: "totalStaff", label: "Total staff", kind: "number" },
        { key: "technicalStaff", label: "Technical staff", kind: "number" },
        { key: "ciinMembers", label: "CIIN members", kind: "number" },
        { key: "cpdHours", label: "CPD hours completed", kind: "number" },
        { key: "trainingSummary", label: "Training record summary", kind: "textarea" },
      ],
    },
  ],
  AIT: [
    {
      title: "Systems and security",
      fields: [
        { key: "coreSystem", label: "Core broking system in use", kind: "text" },
        { key: "lastSystemAudit", label: "Last system audit", kind: "date" },
        { key: "cyberIncidents", label: "Cybersecurity incidents", kind: "number" },
        { key: "incidentSummary", label: "Incident summary", kind: "textarea" },
        { key: "ndpaCompliant", label: "NDPA 2023 compliance attested", kind: "check" },
        { key: "backupFrequency", label: "Backup frequency", kind: "text" },
      ],
    },
  ],
  ARR: [
    {
      title: "Reinsurance placements",
      fields: [
        { key: "totalReinsurancePremium", label: "Total reinsurance premium", kind: "money" },
        { key: "localReinsurancePremium", label: "Placed with local reinsurers", kind: "money" },
        { key: "offshoreReinsurancePremium", label: "Placed offshore", kind: "money" },
        {
          key: "localContentPercentage",
          label: "Local content (%)",
          kind: "number",
          hint: "Local capacity must be exhausted before placing offshore.",
        },
        { key: "offshorePlacements", label: "Itemised offshore placements and NAICOM approval references", kind: "textarea" },
        { key: "remarks", label: "Remarks (explain any offshore placement without an approval, or missing exchange rates)", kind: "textarea" },
      ],
    },
  ],
  ALR: [
    {
      title: "Renewal application",
      fields: [
        { key: "currentLicenceNumber", label: "Current licence number", kind: "text" },
        { key: "currentLicenceExpiry", label: "Current licence expiry", kind: "date" },
        { key: "renewalFeePaid", label: "Renewal fee paid", kind: "money" },
        { key: "feeReceiptNumber", label: "Fee payment reference", kind: "text" },
      ],
    },
    {
      // NAICOM's licensing guidelines make these mandatory attachments;
      // the checklist is what staff actually work through, so it is
      // modelled as one checkbox per document rather than free text.
      title: "Mandatory documents",
      fields: [
        { key: "docAuditedAccounts", label: "Audited financial statements", kind: "check" },
        { key: "docPiCertificate", label: "Professional indemnity certificate", kind: "check" },
        { key: "docFidelityGuarantee", label: "Fidelity guarantee certificate", kind: "check" },
        { key: "docTaxClearance", label: "Tax clearance certificate", kind: "check" },
        { key: "docCacDocuments", label: "CAC incorporation documents", kind: "check" },
        { key: "docCiinLicences", label: "CIIN practising licences for principal officers", kind: "check" },
        { key: "docBoardResolution", label: "Board resolution authorising the application", kind: "check" },
        { key: "docPremisesEvidence", label: "Evidence of registered business premises", kind: "check" },
      ],
    },
    {
      title: "Notes",
      fields: [{ key: "remarks", label: "Remarks", kind: "textarea" }],
    },
  ],
};

// Anything without an entry above still gets a usable form rather than
// nothing at all.
export const FALLBACK_FIELDS: FieldGroup[] = [
  {
    title: "Report content",
    fields: [
      { key: "summary", label: "Summary", kind: "textarea" },
      { key: "keyFigures", label: "Key figures", kind: "textarea" },
      { key: "remarks", label: "Remarks", kind: "textarea" },
    ],
  },
];

export function fieldsFor(reportType: string): FieldGroup[] {
  return REPORT_FIELDS[reportType] || FALLBACK_FIELDS;
}
