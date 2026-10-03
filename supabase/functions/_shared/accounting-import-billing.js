export function calculateAccountingImportCharge(pageCount) {
  const pages = Number(pageCount);
  if (!Number.isInteger(pages) || pages < 1 || pages > 1000) {
    throw new Error('Billable units must be an integer between 1 and 1000.');
  }
  const discountPercent = pages > 100 ? 15 : pages > 30 ? 3 : pages > 20 ? 2 : 0;
  return {
    pageCount: pages,
    discountPercent,
    amount: Number((pages * 10 * (1 - discountPercent / 100)).toFixed(2)),
  };
}