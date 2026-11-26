import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

// The latest sanctions screening of one client, KYC applicant or officer (backend compliance/sanctions), as a badge
// linking to the screening page. Hidden for anyone who can't read screenings (agents) and before the first screening.
interface Latest { result: "Clear" | "Potential match"; review_status: "Not needed" | "Pending" | "False positive" | "Confirmed match"; screened_at: string }

export function SanctionsBadge({ type, id }: { type: "client" | "kyc" | "officer"; id: number }) {
  const { data } = useQuery({
    queryKey: ["sanctions", "subject", type, id],
    queryFn: () => api.get<{ screening: Latest | null }>(`/api/sanctions/subject/${type}/${id}`),
    retry: false,
  });
  const s = data?.screening;
  if (!s) return null;
  const [cls, text] = s.review_status === "Confirmed match" ? ["badge badge-unpaid", "Sanctions: confirmed match"]
    : s.review_status === "Pending" ? ["badge badge-warning", "Sanctions: possible match to review"]
    : s.review_status === "False positive" ? ["badge badge-secondary", "Sanctions: cleared after review"]
    : ["badge badge-paid", "Sanctions: clear"];
  return <Link to="/compliance/sanctions" className={cls} title={`Screened ${s.screened_at}`}>{text}</Link>;
}
