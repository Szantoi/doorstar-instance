import React from 'react';
export function Panel({ title, accent, children, style }) {
  return React.createElement('div', { style: { background: 'var(--surface-board)', border: 'var(--border-panel)', boxShadow: 'var(--shadow-panel)', ...style } },
    title ? React.createElement('div', { style: { background: accent ? 'var(--status-assigned)' : 'var(--chrome-bg)', color: accent ? '#fff' : 'var(--chrome-accent)', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: '13px', letterSpacing: '1.2px', textTransform: 'uppercase', padding: '6px 12px' } }, title) : null,
    React.createElement('div', { style: { padding: '8px' } }, children));
}
