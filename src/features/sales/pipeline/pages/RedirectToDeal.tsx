import { Navigate, useParams } from "react-router";

// The old /deals/:id/edit address: editing now happens on the deal page itself.
export function RedirectToDeal() {
  const { dealId } = useParams();
  return <Navigate to={`/deals/${dealId}`} replace />;
}
