import { useMemo, useState, type ReactNode } from "react";
import "@/shared/styles/coa-tree.css";

export interface CoaAccount {
  id: number;
  code: string;
  name: string;
  account_type: string;
  classification: "Operating" | "Fiduciary";
  parent_id: number | null;
  is_selectable: number;
  description: string | null;
  is_active: number;
}

interface TreeNode {
  account: CoaAccount;
  children: TreeNode[];
}

interface Props {
  accounts: CoaAccount[];
  /** Extra controls on the right of each row (edit / archive). */
  renderActions?: (account: CoaAccount) => ReactNode;
}

function buildTree(accounts: CoaAccount[]): TreeNode[] {
  const nodes = new Map<number, TreeNode>(accounts.map((a) => [a.id, { account: a, children: [] }]));
  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.account.parent_id == null ? undefined : nodes.get(node.account.parent_id);
    (parent ? parent.children : roots).push(node);
  }
  const byCode = (a: TreeNode, b: TreeNode) => a.account.code.localeCompare(b.account.code, undefined, { numeric: true });
  const sortAll = (list: TreeNode[]) => {
    list.sort(byCode);
    list.forEach((n) => sortAll(n.children));
  };
  sortAll(roots);
  return roots;
}

/** Codes of every node that matches, and every ancestor of a match (so the path stays visible). */
function filterTree(roots: TreeNode[], query: string): { visible: Set<number>; matches: Set<number> } {
  const visible = new Set<number>();
  const matches = new Set<number>();
  const needle = query.trim().toLowerCase();
  const walk = (node: TreeNode): boolean => {
    const a = node.account;
    const hit = `${a.code} ${a.name} ${a.description ?? ""}`.toLowerCase().includes(needle);
    let childHit = false;
    for (const child of node.children) if (walk(child)) childHit = true;
    if (hit) matches.add(a.id);
    if (hit || childHit) visible.add(a.id);
    return hit || childHit;
  };
  roots.forEach(walk);
  return { visible, matches };
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>))}
    </>
  );
}

function ClassTag({ account, level }: { account: CoaAccount; level: number }) {
  // A level-1 header only groups the five account types, so it carries no tag.
  if (level === 1 && !account.is_selectable && account.parent_id == null) return null;
  const fiduciary = account.classification === "Fiduciary";
  return (
    <span className={`coa-tag ${fiduciary ? "coa-tag-fiduciary" : "coa-tag-operating"}`} title={fiduciary ? "Client money held in trust. Never use for company expenses." : "The broker's own funds."}>
      {fiduciary ? "Fiduciary / Trust" : "Operational"}
    </span>
  );
}

export function ChartOfAccountsTree({ accounts, renderActions }: Props) {
  const roots = useMemo(() => buildTree(accounts), [accounts]);
  const [query, setQuery] = useState("");
  // Branches the user collapsed (rather than expanded) so the default is "everything open".
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const searching = query.trim().length > 0;
  const filter = useMemo(() => (searching ? filterTree(roots, query) : null), [roots, query, searching]);

  function toggle(id: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function collapseToLevel(level: number) {
    const next = new Set<number>();
    const walk = (nodes: TreeNode[], depth: number) => {
      for (const n of nodes) {
        if (n.children.length && depth >= level) next.add(n.account.id);
        walk(n.children, depth + 1);
      }
    };
    walk(roots, 1);
    setCollapsed(next);
  }

  const rows: { node: TreeNode; level: number }[] = [];
  const collect = (nodes: TreeNode[], level: number) => {
    for (const node of nodes) {
      if (filter && !filter.visible.has(node.account.id)) continue;
      rows.push({ node, level });
      // While searching every visible branch is open, so matches deep in the tree can't be hidden.
      if (node.children.length && (searching || !collapsed.has(node.account.id))) collect(node.children, level + 1);
    }
  };
  collect(roots, 1);

  return (
    <div className="coa-tree-wrap">
      <div className="coa-toolbar">
        <input
          type="search"
          className="coa-search"
          placeholder="Search by code, name or description"
          aria-label="Search chart of accounts"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="coa-legend" aria-hidden="true">
          <span className="coa-tag coa-tag-fiduciary">Fiduciary / Trust</span>
          <span className="coa-tag coa-tag-operating">Operational</span>
        </div>
        <div className="coa-expand">
          <button type="button" className="btn-secondary btn-sm" onClick={() => setCollapsed(new Set())}>Expand all</button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => collapseToLevel(1)}>Collapse all</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="coa-empty">{searching ? "No accounts match your search." : "No accounts have been created."}</p>
      ) : (
        <ul className="coa-tree" role="tree" aria-label="Chart of accounts">
          {rows.map(({ node, level }) => {
            const a = node.account;
            const hasChildren = node.children.length > 0;
            const open = searching || !collapsed.has(a.id);
            return (
              <li
                key={a.id}
                role="treeitem"
                aria-level={level}
                aria-expanded={hasChildren ? open : undefined}
                className={`coa-row coa-${a.classification.toLowerCase()}${a.is_active ? "" : " coa-archived"}${filter?.matches.has(a.id) ? " coa-match" : ""}`}
                style={{ paddingLeft: `${(level - 1) * 1.5 + 0.5}rem` }}
              >
                {hasChildren ? (
                  <button type="button" className="coa-toggle" onClick={() => toggle(a.id)} disabled={searching} aria-label={`${open ? "Collapse" : "Expand"} ${a.name}`}>
                    {open ? "▾" : "▸"}
                  </button>
                ) : (
                  <span className="coa-toggle coa-toggle-spacer" />
                )}
                <span className="coa-code"><Highlight text={a.code} query={query} /></span>
                <span className={`coa-name${a.is_selectable ? "" : " coa-header"}`}>
                  <Highlight text={a.name} query={query} />
                </span>
                <ClassTag account={a} level={level} />
                {a.is_selectable ? <span className="coa-posting" title="Transactions can be posted to this account">Posting</span> : null}
                {!a.is_active && <span className="badge badge-cancelled">Archived</span>}
                {renderActions && <span className="coa-actions">{renderActions(a)}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
