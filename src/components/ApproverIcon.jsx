import { Bank, Briefcase, Scales, ShieldCheck } from '@phosphor-icons/react';

const ICONS = { sales: Briefcase, finance: Bank, legal: Scales, risk: ShieldCheck };

export default function ApproverIcon({ name, size = 20 }) {
  const Icon = ICONS[name] ?? Briefcase;
  return <Icon size={size} weight="duotone" aria-hidden="true" />;
}
