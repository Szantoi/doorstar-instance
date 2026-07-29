import React from 'react';
const CHIP_COLORS = { assigned: 'var(--status-assigned)', inprogress: 'var(--status-inprogress)', done: 'var(--status-done)', problem: 'var(--status-problem)' };
const CHIP_LABELS = { assigned: 'kiosztva', inprogress: 'folyamatban', done: 'kész', problem: 'probléma' };
export function StatusChip({ status = 'assigned', label, count }) {
  return React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-ui)', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: CHIP_COLORS[status] } },
    count != null
      ? React.createElement('span', { style: { background: CHIP_COLORS[status], color: '#fff', borderRadius: '10px', padding: '1px 8px', fontSize: '12px' } }, count)
      : React.createElement('span', { style: { width: '9px', height: '9px', borderRadius: '50%', background: CHIP_COLORS[status] } }),
    label != null ? label : CHIP_LABELS[status]);
}
