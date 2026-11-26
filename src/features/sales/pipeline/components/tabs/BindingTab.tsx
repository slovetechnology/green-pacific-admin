import { useQuery } from "@tanstack/react-query";
import "@/shared/styles/schedules.css";
import { api } from "@/shared/api/client";
import { bindingKey, bindingUrl, type BindInstructions } from "../../lib/binding";
import { CoverNotesPanel } from "../binding/CoverNotesPanel";
import { InstructionPanel } from "../binding/InstructionPanel";
import { ProposalsPanel } from "../binding/ProposalsPanel";
import { SubjectivitiesPanel } from "../binding/SubjectivitiesPanel";
import { isClosed, type TabProps } from "./shared";

// From the client's yes to bound cover (backend sales/binding): the proposal, the subjectivities, the instruction to
// bind (recorded by one user, approved by another, which books the policies) and the cover notes.
export function BindingTab({ detail, canWrite, isAdmin, refresh, goTo }: TabProps) {
  const { deal } = detail;
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: bindingKey(deal.id, "instructions"),
    queryFn: () => api.get<BindInstructions>(bindingUrl(deal.id, "bind-instructions")),
  });
  const editable = canWrite && !isClosed(detail) && deal.stage !== "Lead";
  const bound = data?.instructions.find((b) => b.status === "Bound") ?? null;
  return (
    <div role="tabpanel" id="deal-panel-binding" aria-labelledby="deal-tab-binding" tabIndex={0} className="exec-tabpanel">
      {isLoading && <p className="exec-state">Loading…</p>}
      {error && <p className="exec-state">The binding details could not be loaded.</p>}
      {data && (
        <>
          <ProposalsPanel dealId={deal.id} canWrite={editable} contacts={data.contacts} goTo={goTo} />
          <SubjectivitiesPanel dealId={deal.id} canWrite={canWrite && !deal.archived_at && deal.stage !== "Lost"} isAdmin={isAdmin} quotes={data.quotes} />
          <InstructionPanel dealId={deal.id} data={data} canWrite={canWrite && !deal.archived_at} isAdmin={isAdmin} goTo={goTo} onChanged={async () => { await refetch(); await refresh(); }} />
          <CoverNotesPanel dealId={deal.id} boundInstructionId={bound?.id ?? null} canWrite={canWrite} />
        </>
      )}
    </div>
  );
}
