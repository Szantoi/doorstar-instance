import { buildGanttBars, visualStatusColor, type PlanningVisualOperation } from "./planningVisualizationModel";

interface DependencyGanttTimelineProps { operations: readonly PlanningVisualOperation[]; }

/** Displays only persisted proposal intervals; date calculations stay server-side. */
export function DependencyGanttTimeline({ operations }: DependencyGanttTimelineProps) {
  const chartWidth = 760;
  const bars = buildGanttBars(operations, chartWidth);
  if (!bars.length) return <p role="status">Nincs megjeleníthető, érvényes tervezési időszak.</p>;

  const height = 48 + bars.length * 44;
  return (
    <div className="h-scroll" aria-label="Gantt idősáv">
      <svg role="img" aria-label="Tervezési Gantt idősáv" viewBox={`0 0 980 ${height}`} width="980" height={height} style={{ display: "block", background: "var(--surface-board)" }}>
        <title>Tervezési Gantt idősáv</title>
        {bars.map(({ operation, x, width }, index) => {
          const y = 32 + index * 44;
          return (
            <g key={operation.id}>
              <text x="8" y={y + 16} fontSize="13" fontWeight="700" fill="var(--text-ink)">{operation.label}</text>
              <line x1="215" x2="975" y1={y + 22} y2={y + 22} stroke="var(--line-softer)" />
              <rect x={215 + x} y={y + 7} width={Math.min(width, chartWidth - x)} height="28" rx="3" fill={visualStatusColor(operation.status)}>
                <title>{`${operation.label}: ${operation.scheduledStart} – ${operation.scheduledFinish}`}</title>
              </rect>
              <text x={220 + x} y={y + 26} fontSize="11" fontWeight="700" fill="#fff">{operation.stage}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
