// All Supabase reads/writes for deals live here so pages stay declarative.
// Row level security in the database scopes every query to the user's org.
import { supabase } from './supabase.js';

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export const STATUS_LABELS = {
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  changes_requested: 'Changes requested',
};

export const DECISION_TO_STATUS = {
  Approved: 'approved',
  Rejected: 'rejected',
  'Changes Requested': 'changes_requested',
};

const toRow = (d) => ({
  customer: d.customer.trim(),
  deal_value: d.dealValue,
  discount: d.discount,
  payment_terms: d.paymentTerms,
  implementation_cost: d.implementationCost,
  liability: d.liability,
  sla: d.sla,
  margin: d.margin,
  security_review: d.securityReview,
});

export const fromRow = (r) => ({
  customer: r.customer,
  dealValue: Number(r.deal_value),
  discount: Number(r.discount),
  paymentTerms: r.payment_terms,
  implementationCost: Number(r.implementation_cost),
  liability: r.liability,
  sla: r.sla,
  margin: Number(r.margin),
  securityReview: r.security_review,
});

// Strip non-serializable bits (Set, Date) before storing review output as JSON.
const reviewColumns = (review) => ({
  risk_level: review.riskLevel,
  flags: review.flags.map(({ id, term, value, standard, severity, approver, explanation }) => ({
    id, term, value, standard, severity, approver, explanation,
  })),
  approvers: review.approvers.map(({ id, title, reasons, severity }) => ({ id, title, reasons, severity })),
});

export async function listDeals() {
  return unwrap(
    await supabase
      .from('deals')
      .select('id, customer, deal_value, discount, risk_level, status, source, created_at, updated_at, creator:profiles!deals_created_by_fkey(full_name)')
      .order('created_at', { ascending: false })
  );
}

export async function getDeal(id) {
  const [deal, events] = await Promise.all([
    supabase.from('deals').select('*').eq('id', id).maybeSingle().then(unwrap),
    supabase.from('deal_events').select('*').eq('deal_id', id).order('created_at', { ascending: true }).then(unwrap),
  ]);
  return { deal, events };
}

/**
 * Save the deal terms + AI review. Creates the deal on first review, otherwise
 * updates it. Any new review resets the status to pending: earlier sign-offs
 * and decisions applied to different terms, so a human must decide again.
 */
export async function saveReview({ dealId, orgId, userId, deal, review, source }) {
  const cols = { ...toRow(deal), ...reviewColumns(review), status: 'pending' };
  const row = dealId
    ? unwrap(await supabase.from('deals').update(cols).eq('id', dealId).select().single())
    : unwrap(
        await supabase
          .from('deals')
          .insert({ ...cols, organization_id: orgId, created_by: userId, source: source ?? 'manual' })
          .select()
          .single()
      );
  const event = await addEvent({
    dealId: row.id,
    userId,
    actorLabel: 'DealDesk AI',
    kind: 'ai',
    eventType: 'ai_review',
    text: `Review completed: ${review.flags.length} flag(s), risk ${review.riskLevel}. Routed to ${
      review.approvers.map((a) => a.title).join(', ') || 'no specialist approvers'
    }.`,
    meta: { riskLevel: review.riskLevel, flagCount: review.flags.length },
  });
  return { row, event };
}

export async function addEvent({ dealId, userId, actorLabel, kind, eventType, text, meta = {} }) {
  return unwrap(
    await supabase
      .from('deal_events')
      .insert({ deal_id: dealId, actor_id: userId, actor_label: actorLabel, kind, event_type: eventType, text, meta })
      .select()
      .single()
  );
}

export async function setStatus(dealId, status) {
  return unwrap(await supabase.from('deals').update({ status }).eq('id', dealId).select().single());
}

export async function attachPdf({ orgId, dealId, file }) {
  const path = `${orgId}/${dealId}.pdf`;
  unwrap(await supabase.storage.from('deal-pdfs').upload(path, file, { upsert: true, contentType: 'application/pdf' }));
  return unwrap(await supabase.from('deals').update({ pdf_path: path, source: 'pdf' }).eq('id', dealId).select().single());
}

export async function getPdfUrl(path) {
  const data = unwrap(await supabase.storage.from('deal-pdfs').createSignedUrl(path, 60 * 60));
  return data.signedUrl;
}

/**
 * Rebuild sign-offs and the current decision from the audit trail.
 * Only events after the most recent AI review count.
 */
export function deriveDealState(events) {
  let start = 0;
  events.forEach((e, i) => {
    if (e.event_type === 'ai_review') start = i;
  });
  const signoffs = {};
  let decision = null;
  for (const e of events.slice(start)) {
    if (e.event_type === 'signoff') signoffs[e.meta.approverId] = true;
    if (e.event_type === 'signoff_withdrawn') signoffs[e.meta.approverId] = false;
    if (e.event_type === 'decision')
      decision = { type: e.meta.type, reviewer: e.meta.reviewer, comment: e.meta.comment, at: new Date(e.created_at) };
    if (e.event_type === 'reopened') decision = null;
  }
  const lastReview = events[start]?.event_type === 'ai_review' ? new Date(events[start].created_at) : null;
  return { signoffs, decision, lastReview };
}
