import { Headset, X } from '@phosphor-icons/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Suspense, lazy, useEffect, useState } from 'react';

// The panel pulls in the ElevenLabs SDK (WebRTC, audio worklets), so it only
// loads the first time someone opens support.
const SupportPanel = lazy(() => import('./SupportPanel.jsx'));

export default function SupportLauncher() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (open) setLoaded(true);
  }, [open]);

  // Let other parts of the app open support (e.g. "Talk to support" links).
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('dealdesk:open-support', onOpen);
    return () => window.removeEventListener('dealdesk:open-support', onOpen);
  }, []);

  return (
    <div className="support-root no-print">
      <AnimatePresence>
        {open && loaded && (
          <motion.div
            key="panel"
            className="support-panel-wrap"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            <Suspense
              fallback={
                <div className="support-panel support-loading" role="status">
                  <span className="spinner spinner-accent" aria-hidden="true" /> Loading support…
                </div>
              }
            >
              <SupportPanel onClose={() => setOpen(false)} />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        className={`support-launcher ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="support-panel"
        aria-label={open ? 'Close support' : 'Open support chat'}
      >
        {open ? <X size={22} weight="bold" aria-hidden="true" /> : <Headset size={22} weight="duotone" aria-hidden="true" />}
        {!open && <span className="support-launcher-label">Support</span>}
      </button>
    </div>
  );
}
