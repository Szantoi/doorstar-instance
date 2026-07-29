import { buildDependencyGraph, visualStatusColor, type PlanningVisualDependency, type PlanningVisualOperation } from "./planningVisualizationModel";

interface WorkflowDependencyGraphProps { operations: readonly PlanningVisualOperation[]; dependencies: readonly PlanningVisualDependency[]; }

/** SVG graph for explicit server-provided dependency edges, including FS/SS/FF/SF labels. */
export function WorkflowDependencyGraph({ operations, dependencies }: WorkflowDependencyGraphProps) {
  const { nodes, edges } = buildDependencyGraph(operations, dependencies);
  if (!nodes.length) return <p role="status">Nincs megjeleníthető munkafolyamat.</p>;
  const width = Math.max(...nodes.map((node) => node.x)) + 170;
  const height = Math.max(...nodes.map((node) => node.y)) + 60;
  return (
    <div className="h-scroll" aria-label="Munkafolyamat-függőségek">
      <svg role="img" aria-label="Munkafolyamat-függőségi háló" viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ display: "block", background: "var(--surface-board)" }}>
        <title>Munkafolyamat-függőségi háló</title>
        <defs><marker id="dependency-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--line-strong)" /></marker></defs>
        {edges.map(({ dependency, from, to, label }) => {
          const fromX = from.x + 120;
          const toX = to.x;
          const middleX = (fromX + toX) / 2;
          const middleY = (from.y + to.y) / 2;
          return <g key={`${dependency.predecessorId}-${dependency.successorId}-${dependency.type}`}>
            <path d={`M ${fromX} ${from.y} C ${middleX} ${from.y}, ${middleX} ${to.y}, ${toX} ${to.y}`} fill="none" stroke="var(--line-strong)" strokeWidth="1.5" strokeDasharray={dependency.type === "FS" ? undefined : "5 4"} markerEnd="url(#dependency-arrow)"><title>{label}</title></path>
            <text x={middleX} y={middleY - 5} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text-ink)">{label}</text>
          </g>;
        })}
        {nodes.map(({ operation, x, y }) => <g key={operation.id}>
          <rect x={x} y={y - 22} width="120" height="44" rx="4" fill="var(--surface-board)" stroke={visualStatusColor(operation.status)} strokeWidth="3"><title>{`${operation.label} (${operation.stage})`}</title></rect>
          <text x={x + 60} y={y - 2} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--text-ink)">{operation.label}</text>
          <text x={x + 60} y={y + 13} textAnchor="middle" fontSize="10" fill="var(--text-muted)">{operation.stage}</text>
        </g>)}
      </svg>
    </div>
  );
}
