// A client's KYC standing (GET /api/clients/:id → kyc, GET /api/kyc/:id → clientKyc). Expired means a Verified KYC has
// passed its review date or a document expiry; it blocks binding a deal until the KYC is reviewed again.
export type ClientKycStatus = "Not Started" | "Pending" | "Verified" | "Expired" | "Rejected";

export interface KycStanding {
  status: ClientKycStatus;
  submissionId: number | null;
  referenceNo: string | null;
  riskLevel: string | null;
  verifiedAt: string | null;
  expiresOn: string | null;
  expiringSoon: boolean;
  outstanding: { type: string; label: string; state: string }[];
  pendingReview: { id: number; referenceNo: string } | null;
}

export const CLIENT_KYC_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Any KYC" },
  { value: "Verified", label: "KYC verified" },
  { value: "expiring", label: "KYC expiring (30 days)" },
  { value: "Expired", label: "KYC expired" },
  { value: "Pending", label: "KYC pending" },
  { value: "Not Started", label: "No KYC" },
  { value: "Rejected", label: "KYC rejected" },
];
