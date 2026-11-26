import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RoleGate } from "@/app/guards/RoleGate";
import {
  fetchPolicyDocument,
  fetchPolicyDocumentBlob,
  generatePolicyDocument,
  type BrokingSlip,
  type PolicyDocumentResult,
} from "../api/brokingSlips";

interface Props {
  slip: BrokingSlip;
  // What the approval just returned, so the success state shows without waiting for a refetch.
  justApproved?: PolicyDocumentResult | null;
}

// The policy document issued when a slip linked to a policy is approved: status, download and an inline viewer.
export function PolicyDocumentPanel({ slip, justApproved }: Props) {
  const queryClient = useQueryClient();
  const [showViewer, setShowViewer] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const approved = ["Approved", "Placed", "Completed"].includes(slip.status);
  const linked = Boolean(slip.transaction_id);

  const docQuery = useQuery({
    queryKey: ["policyDocument", slip.id],
    queryFn: () => fetchPolicyDocument(slip.id),
    enabled: approved && linked,
  });
  const doc = docQuery.data;
  const ready = doc?.status === "Generated";

  // The PDF as an object URL (a cross-site <iframe src> would not carry the session cookie).
  const fileQuery = useQuery({
    queryKey: ["policyDocumentFile", slip.id, doc?.revision],
    queryFn: () => fetchPolicyDocumentBlob(slip.id),
    enabled: ready && showViewer,
    staleTime: Infinity,
    gcTime: 0,
  });
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!fileQuery.data) {
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(fileQuery.data);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [fileQuery.data]);

  useEffect(() => {
    if (justApproved?.status === "Generated") {
      setMessage({ kind: "success", text: "Slip approved. The official policy document has been issued." });
      setShowViewer(true);
    } else if (justApproved?.status === "Failed") {
      setMessage({ kind: "error", text: `Slip approved, but the policy document could not be issued: ${justApproved.error ?? "unknown error"}` });
    }
  }, [justApproved]);

  const generateMutation = useMutation({
    mutationFn: () => generatePolicyDocument(slip.id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["policyDocument", slip.id] });
      queryClient.invalidateQueries({ queryKey: ["policyDocumentFile", slip.id] });
      if (result.status === "Generated") {
        setMessage({ kind: "success", text: `Policy document issued (revision ${result.policyDocument?.revision}).` });
        setShowViewer(true);
      } else {
        setMessage({ kind: "error", text: result.error ?? "The policy document could not be issued." });
      }
    },
    onError: (err: Error) => setMessage({ kind: "error", text: err.message }),
  });

  function download() {
    if (!objectUrl) return;
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `Policy_${doc?.policy_number ?? slip.slip_number}.pdf`;
    a.click();
  }

  async function downloadNow() {
    try {
      const blob = await fetchPolicyDocumentBlob(slip.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Policy_${doc?.policy_number ?? slip.slip_number}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    }
  }

  if (!approved) return null;

  return (
    <div className="card" style={{ marginBottom: "1.5rem" }}>
      <h3 className="card-title">Official Policy Document</h3>

      {message && <div className={message.kind === "success" ? "flash flash-success" : "flash flash-error"}>{message.text}</div>}

      {!linked && (
        <p className="text-muted">
          This slip is not linked to a policy, so no policy document is issued. Link the slip to its policy (transaction) to issue one.
        </p>
      )}

      {linked && docQuery.isLoading && <p className="text-muted">Checking for the policy document…</p>}

      {linked && !docQuery.isLoading && !doc && (
        <p className="text-muted">No policy document has been issued for this slip yet.</p>
      )}

      {doc?.status === "Failed" && (
        <div className="flash flash-error">The last attempt failed: {doc.error ?? "unknown error"}</div>
      )}

      {ready && (
        <p>
          Policy <strong>{doc.policy_number}</strong>, revision {doc.revision}
          {doc.generated_at ? `, issued ${new Date(doc.generated_at.replace(" ", "T")).toLocaleString("en-GB")}` : ""}
          {doc.generated_by ? ` by ${doc.generated_by}` : ""}.
        </p>
      )}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {ready && (
          <>
            <button type="button" className="btn btn-primary" onClick={objectUrl ? download : downloadNow}>
              Download Official Policy Document
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setShowViewer((v) => !v)}>
              {showViewer ? "Hide viewer" : "View here"}
            </button>
          </>
        )}
        {linked && (
          <RoleGate need="write">
            <button type="button" className="btn btn-outline" disabled={generateMutation.isPending} onClick={() => generateMutation.mutate()}>
              {generateMutation.isPending ? "Generating…" : ready ? "Regenerate" : "Generate policy document"}
            </button>
          </RoleGate>
        )}
      </div>

      {ready && showViewer && (
        <div style={{ marginTop: "1rem" }}>
          {fileQuery.isLoading && <p className="text-muted">Loading document…</p>}
          {fileQuery.isError && <div className="flash flash-error">{(fileQuery.error as Error).message}</div>}
          {objectUrl && (
            <iframe
              title="Policy document"
              src={objectUrl}
              style={{ width: "100%", height: "75vh", border: "1px solid var(--border-color)", borderRadius: "6px" }}
            />
          )}
        </div>
      )}
    </div>
  );
}
