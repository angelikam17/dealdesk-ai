import { Desktop, Moon, Sun } from '@phosphor-icons/react';
import { useTheme } from '../lib/theme.js';

const LABEL = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' };
const NEXT = { system: 'light', light: 'dark', dark: 'system' };
const ICON = { system: Desktop, light: Sun, dark: Moon };

/** Cycles system -> light -> dark. One button, so it fits in a crowded header. */
export default function ThemeToggle({ onDark = false }) {
  const { pref, cycle } = useTheme();
  const Icon = ICON[pref];
  return (
    <button
      type="button"
      className={`icon-btn ${onDark ? 'icon-btn-on-dark' : ''}`}
      onClick={cycle}
      aria-label={`${LABEL[pref]}. Switch to ${LABEL[NEXT[pref]].toLowerCase()}`}
      title={LABEL[pref]}
    >
      <Icon size={18} weight="duotone" aria-hidden="true" />
    </button>
  );
}
