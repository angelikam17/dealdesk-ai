import { Check, Copy, EnvelopeSimple, FilePdf, Printer } from '@phosphor-icons/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { buildMailto, buildShareText } from '../../lib/share.js';

export default function SharePanel({ deal, review, status, decision, pdfUrl }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? window.location.href : '';
  const args = { deal, review, status, decision, url };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildShareText(args));
      setCopied(true);
      toast.success('Summary copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      toast.error('Could not copy. Select the text in the summary instead.');
    }
  };

  return (
    <div className="share-bar no-print" role="group" aria-label="Share this review">
      <a className="btn btn-outline btn-sm" href={buildMailto(args)}>
        <EnvelopeSimple size={16} aria-hidden="true" /> Email summary
      </a>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => window.print()}>
        <Printer size={16} aria-hidden="true" /> Print or save as PDF
      </button>
      <button type="button" className="btn btn-outline btn-sm" onClick={copy}>
        {copied ? <Check size={16} weight="bold" aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        <span aria-live="polite">{copied ? 'Copied' : 'Copy summary'}</span>
      </button>
      {pdfUrl && (
        <a className="btn btn-ghost btn-sm" href={pdfUrl} target="_blank" rel="noreferrer">
          <FilePdf size={16} aria-hidden="true" /> Source contract
        </a>
      )}
    </div>
  );
}
