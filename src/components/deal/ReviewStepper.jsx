import { Check } from '@phosphor-icons/react';

/**
 * Where this deal is in the process. Four fixed steps so the shape never
 * changes; only the state of each step does.
 */
export default function ReviewStepper({ review, signoffs, decision, stale }) {
  const total = review.approvers.length;
  const signed = review.approvers.filter((a) => signoffs[a.id]).length;

  const steps = [
    { key: 'terms', label: 'Terms entered', state: 'done' },
    { key: 'review', label: stale ? 'Review out of date' : 'AI review', state: stale ? 'warn' : 'done' },
    {
      key: 'signoffs',
      label: total === 0 ? 'No sign-offs needed' : `Sign-offs ${signed} of ${total}`,
      state: total === 0 || signed === total ? 'done' : signed > 0 ? 'active' : 'todo',
    },
    {
      key: 'decision',
      label: decision ? `Deal ${decision.type.toLowerCase()}` : 'Human decision',
      state: decision ? 'done' : signed === total ? 'active' : 'todo',
    },
  ];

  const current = steps.findIndex((s) => s.state !== 'done');

  return (
    <ol className="stepper no-print" aria-label="Review progress">
      {steps.map((s, i) => (
        <li key={s.key} className={`step step-${s.state}`} aria-current={i === current ? 'step' : undefined}>
          <span className="step-dot" aria-hidden="true">
            {s.state === 'done' ? <Check size={12} weight="bold" /> : i + 1}
          </span>
          <span className="step-label">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
