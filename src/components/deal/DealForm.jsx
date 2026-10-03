import { LIABILITY_TERMS, PAYMENT_TERMS, SLA_OPTIONS, STANDARDS } from '../../lib/reviewEngine.js';

const num = (v) => (v === '' ? '' : Number(v));

export default function DealForm({ form, errors, update, flags = [], disabled }) {
  const sev = (id) => flags.find((f) => f.id === id)?.severity;

  return (
    <fieldset className="deal-form" disabled={disabled}>
      <legend className="sr-only">Deal terms</legend>

      <Field id="customer" label="Customer" error={errors.customer}>
        <input
          id="customer"
          aria-describedby="customer-hint"
          name="customer"
          autoComplete="organization"
          value={form.customer}
          onChange={(e) => update('customer', e.target.value)}
          placeholder="e.g. Northwind Logistics, Inc.…"
        />
      </Field>

      <Field id="dealValue" label="Deal value (list)" error={errors.dealValue}>
        <Affix prefix="$">
          <input
            id="dealValue"
            aria-describedby="dealValue-hint"
            name="dealValue"
            type="number"
            autoComplete="off"
            inputMode="numeric"
            min="0"
            step="1000"
            value={form.dealValue}
            onChange={(e) => update('dealValue', num(e.target.value))}
          />
        </Affix>
      </Field>

      <Field id="discount" label="Discount" standard={STANDARDS.discount} severity={sev('discount')} error={errors.discount}>
        <Affix suffix="%">
          <input
            id="discount"
            aria-describedby="discount-hint"
            name="discount"
            type="number"
            autoComplete="off"
            inputMode="decimal"
            min="0"
            max="100"
            step="1"
            value={form.discount}
            onChange={(e) => update('discount', num(e.target.value))}
          />
        </Affix>
      </Field>

      <Field id="paymentTerms" label="Payment terms" standard={STANDARDS.paymentTerms} severity={sev('payment')}>
        <select id="paymentTerms" aria-describedby="paymentTerms-hint" name="paymentTerms" value={form.paymentTerms} onChange={(e) => update('paymentTerms', e.target.value)}>
          {PAYMENT_TERMS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>

      <Field
        id="implementationCost"
        label="Custom implementation cost"
        standard={STANDARDS.implementationCost}
        severity={sev('implementation')}
        error={errors.implementationCost}
      >
        <Affix prefix="$">
          <input
            id="implementationCost"
            aria-describedby="implementationCost-hint"
            name="implementationCost"
            type="number"
            autoComplete="off"
            inputMode="numeric"
            min="0"
            step="1000"
            value={form.implementationCost}
            onChange={(e) => update('implementationCost', num(e.target.value))}
          />
        </Affix>
      </Field>

      <Field id="liability" label="Liability terms" standard={STANDARDS.liability} severity={sev('liability')}>
        <select id="liability" aria-describedby="liability-hint" name="liability" value={form.liability} onChange={(e) => update('liability', e.target.value)}>
          {LIABILITY_TERMS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>

      <Field id="sla" label="Uptime SLA" standard={STANDARDS.sla} severity={sev('sla')}>
        <select id="sla" aria-describedby="sla-hint" name="sla" value={form.sla} onChange={(e) => update('sla', e.target.value)}>
          {SLA_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}%
            </option>
          ))}
        </select>
      </Field>

      <Field id="margin" label="Expected margin" standard={STANDARDS.margin} severity={sev('margin')} error={errors.margin}>
        <Affix suffix="%">
          <input
            id="margin"
            aria-describedby="margin-hint"
            name="margin"
            type="number"
            autoComplete="off"
            inputMode="decimal"
            min="-100"
            max="100"
            step="1"
            value={form.margin}
            onChange={(e) => update('margin', num(e.target.value))}
          />
        </Affix>
      </Field>

      <label className={`checkbox-row ${sev('security') ? 'is-flagged sev-medium' : ''}`}>
        <input
          type="checkbox"
          name="securityReview"
          checked={form.securityReview}
          onChange={(e) => update('securityReview', e.target.checked)}
        />
        <span>Customer requested custom security or data-handling terms</span>
      </label>
    </fieldset>
  );
}

function Field({ id, label, standard, severity, error, children }) {
  const hintId = `${id}-hint`;
  return (
    <div className={`field ${severity ? `is-flagged sev-${severity.toLowerCase()}` : ''} ${error ? 'has-error' : ''}`}>
      <div className="field-label">
        <label htmlFor={id}>{label}</label>
        {severity && <span className="tag-nonstandard">Nonstandard</span>}
      </div>
      {children}
      {error ? (
        <div id={hintId} className="field-error" role="alert">
          {error}
        </div>
      ) : (
        standard && (
          <div id={hintId} className="field-hint">
            Standard: {standard}
          </div>
        )
      )}
    </div>
  );
}

function Affix({ prefix, suffix, children }) {
  return (
    <div className={`input-affix ${suffix ? 'has-suffix' : 'has-prefix'}`}>
      {prefix && <span aria-hidden="true">{prefix}</span>}
      {children}
      {suffix && <span aria-hidden="true">{suffix}</span>}
    </div>
  );
}
