import React from 'react';
export function Button({ variant = 'outline', children, style, ...rest }) {
  const base = { fontFamily: 'var(--font-ui)', fontWeight: 700, cursor: 'pointer', letterSpacing: '.5px' };
  const variants = {
    outline: { border: '1.5px solid var(--line-strong)', background: '#fff', color: 'var(--text-ink)', fontSize: '12.5px', padding: '4px 12px', borderRadius: 'var(--radius-chip)' },
    primary: { border: 'none', background: 'var(--marker-blue)', color: '#fff', fontSize: '13px', padding: '6px 14px', borderRadius: 'var(--radius-btn)' },
    chrome:  { border: 'none', background: 'var(--chrome-control)', color: '#ddd', fontSize: '14px', fontWeight: 600, padding: '6px 14px', borderRadius: 'var(--radius-btn)' },
    active:  { border: 'none', background: 'var(--chrome-accent)', color: 'var(--chrome-bg)', fontSize: '14px', fontWeight: 600, padding: '6px 14px', borderRadius: 'var(--radius-btn)' },
    danger:  { border: '1px solid var(--line-input)', background: '#fff', color: 'var(--text-muted)', fontSize: '11px', padding: '2px 8px', borderRadius: 'var(--radius-chip)' }
  };
  return React.createElement('button', { style: { ...base, ...variants[variant], ...style }, ...rest }, children);
}
