// Theme preference: 'system' (follow the OS), 'light' or 'dark'.
// index.html applies the stored value before first paint so there is no flash.
import { useEffect, useState } from 'react';

export const THEME_KEY = 'dealdesk-theme';
export const THEMES = ['system', 'light', 'dark'];

const read = () => {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return THEMES.includes(v) ? v : 'system';
  } catch {
    return 'system';
  }
};

export function applyTheme(pref) {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
}

/** The scheme actually in effect right now, after resolving 'system'. */
export function resolvedScheme(pref) {
  if (pref === 'light' || pref === 'dark') return pref;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [pref, setPref] = useState(read);
  const [scheme, setScheme] = useState(() => resolvedScheme(read()));

  useEffect(() => {
    applyTheme(pref);
    try {
      if (pref === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, pref);
    } catch {
      /* private mode: preference just won't persist */
    }
    setScheme(resolvedScheme(pref));
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setScheme(resolvedScheme('system'));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  const cycle = () => setPref((p) => THEMES[(THEMES.indexOf(p) + 1) % THEMES.length]);
  return { pref, scheme, setPref, cycle };
}
