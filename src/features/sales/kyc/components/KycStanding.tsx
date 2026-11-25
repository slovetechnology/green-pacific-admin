import { Link } from "react-router";
import type { KycStanding } from "../kycStanding";

const slug = (s: string) => s.toLowerCase().replace(/\s+/g, "-");

/** "KYC Verified · to 2027-09-21" as a badge, linking to the submission when there is one. */
export function KycStandingChip({ kyc }: { kyc: KycStanding }) {
  const tone = kyc.status === "Verified" && kyc.expiringSoon ? "pending" : slug(kyc.status);
  const text = `KYC ${kyc.status === "Not Started" ? "not started" : kyc.status.toLowerCase()}${kyc.expiresOn && (kyc.status === "Verified" || kyc.status === "Expired") ? ` · ${kyc.status === "Expired" ? "since" : "to"} ${kyc.expiresOn}` : ""}`;
  const badge = <span className={`badge badge-${tone}`} title={kyc.referenceNo ? `KYC ${kyc.referenceNo}` : undefined}>{text}</span>;
  return kyc.submissionId ? <Link to={`/kyc-submissions/${kyc.submissionId}`}>{badge}</Link> : badge;
}

/** What needs doing about a client's KYC, or null when nothing does. */
export function KycStandingNotice({ kyc, clientId }: { kyc: KycStanding; clientId: number }) {
  const link = kyc.submissionId ? <Link to={`/kyc-submissions/${kyc.submissionId}`}>Open KYC {kyc.referenceNo}</Link> : <Link to={`/kyc?client_id=${clientId}`}>Start KYC</Link>;
  if (kyc.status === "Expired") {
    return (
      <div className="flash flash-error" role="status">
        This client's KYC expired on {kyc.expiresOn}. No deal can be bound for them until it is reviewed again
        {kyc.pendingReview ? <> (a new KYC, <Link to={`/kyc-submissions/${kyc.pendingReview.id}`}>{kyc.pendingReview.referenceNo}</Link>, is waiting for review)</> : null}. {link}
      </div>
    );
  }
  if (kyc.status === "Rejected" || kyc.status === "Not Started") {
    return <div className="flash flash-warning" role="status">{kyc.status === "Rejected" ? "This client's KYC was rejected." : "This client has no KYC on file."} It must be verified before a deal is bound. {link}</div>;
  }
  if (kyc.status === "Pending") return <div className="flash flash-warning" role="status">KYC {kyc.referenceNo} is waiting for review. {link}</div>;
  const notes = [
    kyc.expiringSoon ? `It expires on ${kyc.expiresOn}; start the review now.` : null,
    kyc.outstanding.length ? `Documents not yet verified: ${kyc.outstanding.map((o) => o.label).join("; ")}.` : null,
  ].filter(Boolean);
  return notes.length ? <div className="flash flash-warning" role="status">KYC is verified. {notes.join(" ")} {link}</div> : null;
}
