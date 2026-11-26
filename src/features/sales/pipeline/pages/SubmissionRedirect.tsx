import { Navigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

// Market submissions live on their deal now. An old /submissions/:id link (a bookmark, an
// appraisal evidence link) finds the deal the submission belongs to and goes there.
export function SubmissionRedirect() {
  const { submissionId } = useParams();
  const { data, isError, isLoading } = useQuery({
    queryKey: ["deals", "submission-redirect", submissionId],
    queryFn: () => api.get<{ dealId: number }>(`/api/submissions/${submissionId}/deal`),
    retry: false,
  });
  if (isLoading) return <p>Loading…</p>;
  if (isError || !data) return <Navigate to="/deals" replace />;
  return <Navigate to={`/deals/${data.dealId}?tab=quotes`} replace />;
}
