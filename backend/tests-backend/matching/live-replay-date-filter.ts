export function buildDocumentDateFilter(
  fromDateOnly: string,
  toDateOnly: string,
  includeUndatedDocs: boolean
): string {
  const dateWindowFilter =
    `and(invoice_date.gte.${fromDateOnly},invoice_date.lte.${toDateOnly}),` +
    `and(due_date.gte.${fromDateOnly},due_date.lte.${toDateOnly})`;
  if (!includeUndatedDocs) {
    return dateWindowFilter;
  }
  return `${dateWindowFilter},and(invoice_date.is.null,due_date.is.null)`;
}

