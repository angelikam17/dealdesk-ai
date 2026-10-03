import { CheckCircle, FilePdf, Question, UploadSimple, WarningCircle } from '@phosphor-icons/react';
import { useId, useRef, useState } from 'react';
import { EXTRACT_FIELDS, extractDealTerms } from '../../lib/extractDealTerms.js';
import { extractPdfText, validatePdfFile } from '../../lib/pdfText.js';
import { LIABILITY_TERMS, PAYMENT_TERMS, SLA_OPTIONS } from '../../lib/reviewEngine.js';

const CONTROLS = {
  customer: { type: 'text' },
  dealValue: { type: 'number', prefix: '$' },
  discount: { type: 'number', suffix: '%' },
  paymentTerms: { type: 'select', options: PAYMENT_TERMS },
  implementationCost: { type: 'number', prefix: '$' },
  liability: { type: 'select', options: LIABILITY_TERMS },
  sla: { type: 'select', options: SLA_OPTIONS, format: (o) => `${o}%` },
  margin: { type: 'number', suffix: '%' },
  securityReview: { type: 'checkbox' },
};

/**
 * Upload a contract PDF, extract terms in the browser, and let a person
 * confirm or correct every value before it touches the deal form.
 */
export default function PdfImport({ onApply, onCancel }) {
  const [stage, setStage] = useState('pick'); // pick | reading | review
  const [error, setError] = useState('');
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [values, setValues] = useState({});
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const inputId = useId();

  const process = async (f) => {
    const problem = validatePdfFile(f);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setFile(f);
    setStage('reading');
    try {
      const text = await extractPdfText(f);
      const res = extractDealTerms(text);
      setResult({ ...res, empty: !text.trim() });
      setValues(Object.fromEntries(EXTRACT_FIELDS.map(({ key }) => [key, res.fields[key].value ?? ''])));
      setStage('review');
    } catch (e) {
      setError(`We couldn't read that PDF (${e.message}). Try another file or enter the terms by hand.`);
      setStage('pick');
    }
  };

  const loadSample = async () => {
    try {
      const res = await fetch('/samples/sample-deal.pdf');
      const blob = await res.blob();
      process(new File([blob], 'sample-deal.pdf', { type: 'application/pdf' }));
    } catch {
      setError('Could not load the sample PDF.');
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) process(f);
  };

  const set = (key, v) => setValues((s) => ({ ...s, [key]: v }));

  if (stage === 'review' && result) {
    return (
      <section className="pdf-review" aria-labelledby="extract-h">
        <div className="panel-head">
          <div>
            <h2 id="extract-h">Check the extracted values</h2>
            <p className="muted small">
              <FilePdf size={14} aria-hidden="true" /> {file?.name} · found {result.foundCount} of 8 terms
            </p>
          </div>
        </div>
        <p className="extract-intro">
          Nothing has been saved or reviewed yet. Correct anything that looks wrong, then apply the values to the deal form.
        </p>
        {result.empty && (
          <p className="notice" role="alert">
            This PDF has no selectable text (it may be a scan), so nothing could be extracted. Fill in the values below by hand.
          </p>
        )}
        <ul className="extract-list">
          {EXTRACT_FIELDS.map(({ key, label }) => {
            const f = result.fields[key];
            const c = CONTROLS[key];
            const id = `x-${key}`;
            return (
              <li key={key} className={`extract-row ${f.found ? 'is-found' : 'is-missing'}`}>
                <div className="extract-label">
                  <label htmlFor={id}>{label}</label>
                  {f.found ? (
                    <span className="x-status found"><CheckCircle size={14} weight="fill" aria-hidden="true" /> Found</span>
                  ) : (
                    <span className="x-status missing"><Question size={14} weight="fill" aria-hidden="true" /> Not found</span>
                  )}
                </div>
                <ExtractControl id={id} control={c} value={values[key]} onChange={(v) => set(key, v)} />
                {f.note && <p className="x-note">{f.note}</p>}
                {f.snippet && <blockquote className="x-snippet">{f.snippet}</blockquote>}
              </li>
            );
          })}
        </ul>
        <div className="form-actions">
          <button type="button" className="btn btn-primary btn-block" onClick={() => onApply(values, file)}>
            Apply to deal form
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={() => {
              setStage('pick');
              setResult(null);
              setFile(null);
            }}
          >
            Choose a different file
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="pdf-pick" aria-labelledby="upload-h">
      <div className="panel-head">
        <h2 id="upload-h">Upload a contract</h2>
        {onCancel && (
          <button type="button" className="link-btn" onClick={onCancel}>
            Enter by hand
          </button>
        )}
      </div>
      <label
        htmlFor={inputId}
        className={`dropzone ${dragging ? 'is-dragging' : ''} ${stage === 'reading' ? 'is-busy' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {stage === 'reading' ? (
          <span className="drop-busy" role="status">
            <span className="spinner spinner-accent" aria-hidden="true" /> Reading {file?.name}…
          </span>
        ) : (
          <>
            <UploadSimple size={28} weight="duotone" aria-hidden="true" />
            <span className="drop-title">Drop a PDF here or click to browse</span>
            <span className="muted small">PDF only, up to 10 MB. Text is read in your browser.</span>
          </>
        )}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          disabled={stage === 'reading'}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) process(f);
          }}
        />
      </label>
      {error && (
        <p className="field-error drop-error" role="alert">
          <WarningCircle size={14} aria-hidden="true" /> {error}
        </p>
      )}
      <button type="button" className="link-btn sample-link" onClick={loadSample} disabled={stage === 'reading'}>
        <FilePdf size={16} aria-hidden="true" /> Try with sample PDF
      </button>
    </section>
  );
}

function ExtractControl({ id, control, value, onChange }) {
  if (control.type === 'checkbox') {
    return (
      <label className="x-check">
        <input id={id} name={id} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        <span>{value ? 'Yes, flag for security review' : 'No custom security terms'}</span>
      </label>
    );
  }
  if (control.type === 'select') {
    return (
      <select id={id} name={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Not set (keep current)</option>
        {control.options.map((o) => (
          <option key={o} value={o}>
            {control.format ? control.format(o) : o}
          </option>
        ))}
      </select>
    );
  }
  const input = (
    <input
      id={id}
      name={id}
      autoComplete="off"
      type={control.type}
      inputMode={control.type === 'number' ? 'decimal' : undefined}
      value={value}
      onChange={(e) => onChange(control.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)}
      placeholder="Not found"
    />
  );
  if (!control.prefix && !control.suffix) return input;
  return (
    <div className={`input-affix ${control.suffix ? 'has-suffix' : 'has-prefix'}`}>
      {control.prefix && <span aria-hidden="true">{control.prefix}</span>}
      {input}
      {control.suffix && <span aria-hidden="true">{control.suffix}</span>}
    </div>
  );
}
