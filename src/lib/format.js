// Shared Intl formatters so dates read naturally in the viewer's locale.
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const compact = new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' });

const toDate = (v) => (v instanceof Date ? v : new Date(v));
export const fmtDateTime = (v) => dateTime.format(toDate(v));
export const fmtDate = (v) => dateOnly.format(toDate(v));
export const fmtDateTimeShort = (v) => compact.format(toDate(v));
