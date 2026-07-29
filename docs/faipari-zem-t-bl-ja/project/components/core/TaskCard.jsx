import React from 'react';
const CARD_COLORS = { assigned: 'var(--status-assigned)', inprogress: 'var(--status-inprogress)', done: 'var(--status-done)', problem: 'var(--status-problem)' };
export function TaskCard({ title, status = 'assigned', meta, urgent, seed = 0, onClick }) {
  const rot = ((seed * 37) % 100) / 100 * 1.6 - 0.8;
  return React.createElement('div', { onClick, style: { fontFamily: 'var(--font-hand)', fontWeight: 700, fontSize: 'var(--hand-size-card)', lineHeight: 1.12, color: CARD_COLORS[status], cursor: onClick ? 'pointer' : 'default', padding: '3px 4px 4px', transform: 'rotate(' + rot.toFixed(2) + 'deg)', textDecoration: urgent ? 'underline' : 'none', textDecorationThickness: '2px', opacity: status === 'done' ? 0.75 : 1 } },
    React.createElement('div', null, (urgent ? '!! ' : '') + title, status === 'done' ? React.createElement('span', { style: { color: 'var(--marker-green)' } }, ' \u2713') : null),
    meta ? React.createElement('div', { style: { fontFamily: 'var(--font-ui)', fontSize: '10.5px', color: 'var(--text-faint)', fontWeight: 600, letterSpacing: '.3px' } }, meta) : null);
}
