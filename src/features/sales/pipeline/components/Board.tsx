import { useState, type DragEvent } from "react";
import { Link } from "react-router";
import { fmtMoneyShort } from "@/shared/lib/format";
import { dealLink, daysSince, daysUntil, initials, isStale, legalMoves, moveKind, STAGES, type DealRow, type Stage } from "../lib/types";

const CLOSED_PREVIEW = 8;

function expiryChip(deal: DealRow): { text: string; tone: string } | null {
  if (!deal.x_date || deal.stage === "Won" || deal.stage === "Lost") return null;
  const left = daysUntil(deal.x_date);
  if (left === null || left > 30) return null;
  if (left < 0) return { text: `Expired ${-left}d ago`, tone: "is-crit" };
  return { text: left === 0 ? "Expires today" : `Expires in ${left}d`, tone: "is-warn" };
}

function Card({
  deal, canWrite, staleDays, dragging, onDragStart, onDragEnd, onRequestMove,
}: {
  deal: DealRow; canWrite: boolean; staleDays: number; dragging: boolean;
  onDragStart: (deal: DealRow, e: DragEvent) => void; onDragEnd: () => void; onRequestMove: (deal: DealRow, to: Stage) => void;
}) {
  const open = deal.stage !== "Won" && deal.stage !== "Lost";
  const stale = isStale(deal, staleDays);
  const expiry = expiryChip(deal);
  const inStage = daysSince(deal.stage_entered_at ?? deal.created_at);
  const moves = legalMoves(deal.stage);
  const classes = ["pl-card", dragging ? "is-dragging" : "", stale ? "is-stale" : "", deal.next_step_ready ? "is-ready" : ""].filter(Boolean).join(" ");
  return (
    <article className={classes} draggable={canWrite && moves.length > 0} onDragStart={(e) => onDragStart(deal, e)} onDragEnd={onDragEnd} aria-label={`${deal.deal_name}, ${deal.stage}`}>
      <Link to={dealLink(deal.id)} className="pl-card-title">{deal.deal_name}</Link>
      <span className="pl-card-client">{deal.client_name}</span>
      <div className="pl-card-chips">
        {deal.class_of_business && <span className="pl-chip">{deal.class_of_business}</span>}
        {deal.deal_type === "Renewal" && <span className="pl-chip is-good">Renewal</span>}
        {expiry && <span className={`pl-chip ${expiry.tone}`}>{expiry.text}</span>}
        {stale && <span className="pl-chip is-warn" title="No activity or stage move for a while">Stale</span>}
        {deal.stage === "Lost" && deal.lost_reason_code && <span className="pl-chip">{deal.lost_reason_code}</span>}
      </div>
      <div className="pl-card-foot">
        <span className="pl-card-money" title={`Expected brokerage ${fmtMoneyShort(deal.weighted_value)}`}>{fmtMoneyShort(deal.estimated_premium)}</span>
        <span>{inStage !== null ? `${inStage}d in stage` : ""}</span>
        <span className="pl-owner" title={deal.owner_name ?? "Unassigned"}>{initials(deal.owner_name)}</span>
      </div>
      {open && deal.next_step_label && (
        <p className={deal.next_step_ready ? "pl-next is-ready" : "pl-next"}>{deal.next_step_ready ? "Ready: " : "Next: "}{deal.next_step_label}</p>
      )}
      {canWrite && moves.length > 0 && (
        <select className="pl-move" aria-label={`Move ${deal.deal_name}`} value="" onChange={(e) => e.target.value && onRequestMove(deal, e.target.value as Stage)}>
          <option value="">Move to…</option>
          {moves.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      )}
    </article>
  );
}

// One column per stage. Cards drag between columns on a desktop; the "Move to"
// menu on every card does the same for keyboards and touch screens. A drop only
// asks the server to move the deal: the server's rules decide, and its reasons
// are shown when it says no.
export function Board({
  deals, canWrite, staleDays, onRequestMove, onShowAll,
}: {
  deals: DealRow[]; canWrite: boolean; staleDays: number;
  onRequestMove: (deal: DealRow, to: Stage) => void; onShowAll: (stage: Stage) => void;
}) {
  const [dragging, setDragging] = useState<DealRow | null>(null);
  const [over, setOver] = useState<Stage | null>(null);

  function start(deal: DealRow, e: DragEvent) {
    e.dataTransfer.setData("text/plain", String(deal.id));
    e.dataTransfer.effectAllowed = "move";
    setDragging(deal);
  }
  function end() {
    setDragging(null);
    setOver(null);
  }

  return (
    <div className="pl-board" role="group" aria-label="Pipeline board">
      {STAGES.map((stage) => {
        const inStage = deals.filter((d) => d.stage === stage);
        const closed = stage === "Won" || stage === "Lost";
        const shown = closed ? inStage.slice(0, CLOSED_PREVIEW) : inStage;
        const total = inStage.reduce((sum, d) => sum + (Number(d.estimated_premium) || 0), 0);
        const legal = dragging ? moveKind(dragging.stage, stage) !== null : false;
        const classes = ["pl-col", closed ? "is-closed" : "", dragging && legal ? "is-target" : "", dragging && !legal ? "is-blocked" : "", over === stage && legal ? "is-over" : ""].filter(Boolean).join(" ");
        return (
          <section
            key={stage}
            className={classes}
            aria-label={`${stage}, ${inStage.length} deals`}
            onDragOver={(e) => {
              if (dragging && legal) {
                e.preventDefault();
                setOver(stage);
              }
            }}
            onDragLeave={() => setOver((cur) => (cur === stage ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              const moved = dragging;
              end();
              if (moved && moved.stage !== stage) onRequestMove(moved, stage);
            }}
          >
            <header className="pl-col-head">
              <h2>{stage} <span className="pl-chip">{inStage.length}</span></h2>
              <span className="pl-col-sum">{fmtMoneyShort(total)}</span>
            </header>
            <div className="pl-col-body">
              {shown.length === 0 && <p className="pl-col-empty">{dragging && legal ? "Drop here" : "No deals"}</p>}
              {shown.map((deal) => (
                <Card key={deal.id} deal={deal} canWrite={canWrite} staleDays={staleDays} dragging={dragging?.id === deal.id} onDragStart={start} onDragEnd={end} onRequestMove={onRequestMove} />
              ))}
            </div>
            {closed && inStage.length > CLOSED_PREVIEW && (
              <div className="pl-col-more">
                <button type="button" className="btn-link" onClick={() => onShowAll(stage)}>View all {inStage.length} in the list</button>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
