import { useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { fmtMoney } from "@/shared/lib/format";
import { RequestQuoteForm, answersFromParams, type FormMeta, type QuoteContact } from "@/features/portal/public/components/RequestQuoteForm";

// The signed-in client's Quote Requests: the same per-class Request for Quote form as the public
// marketplace, with their details filled in, plus the list of what they have asked for.

interface QuoteRequest {
  id: number;
  reference: string | null;
  request_type: string;
  class_of_business: string | null;
  subject_matter: string | null;
  sum_insured_estimate: number;
  status: string;
  created_at: string;
}

interface Response {
  requests: QuoteRequest[];
  form: FormMeta;
  contact: QuoteContact;
}

export function PortalQuotesPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["portal", "quotes"],
    queryFn: () => api.get<Response>("/api/portal/quotes"),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Customer Portal</p>
          <h1>Request a Quote</h1>
          <p className="text-muted">
            Tell us about what you want to insure or change. We compare our insurer panel and send your premium quote
            within {data?.form.ackHours ?? 24} hours.
          </p>
        </div>
      </div>

      {isLoading ? (
        <p>Loading…</p>
      ) : isError || !data ? (
        <div className="flash flash-error">The quote form could not be loaded. Please refresh the page or contact us.</div>
      ) : (
        <RequestQuoteForm
          meta={data.form}
          submitUrl="/api/portal/quotes"
          contact={data.contact}
          initialClass={searchParams.get("class")}
          initialAnswers={answersFromParams(searchParams)}
          showRequestType
          onSubmitted={() => queryClient.invalidateQueries({ queryKey: ["portal", "quotes"] })}
        />
      )}

      <div className="card">
        <h2>Your Requests</h2>
      </div>
      <DataGrid
        columns={
          [
            { key: "date", header: "Date", render: (r) => (r.created_at || "").slice(0, 10) },
            { key: "reference", header: "Reference", render: (r) => r.reference || "—" },
            { key: "type", header: "Type", render: (r) => r.request_type },
            { key: "class", header: "Class", render: (r) => r.class_of_business || "—" },
            { key: "subject_matter", header: "Subject Matter", render: (r) => r.subject_matter || "—" },
            { key: "sum_insured", header: "Est. Sum Insured", align: "right", render: (r) => fmtMoney(r.sum_insured_estimate) },
            { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          ] as DataGridColumn<QuoteRequest>[]
        }
        rows={data?.requests}
        isLoading={isLoading}
        getRowKey={(r) => r.id}
        emptyMessage="No quote requests yet."
      />
    </div>
  );
}
