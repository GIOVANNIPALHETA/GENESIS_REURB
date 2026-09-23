type ChecklistDocument = { status: string; expirationDate?: Date | null };

export function isApprovedAndValid(document: ChecklistDocument, now = new Date()): boolean {
  if (document.status !== 'APPROVED') return false;
  // Validity includes the expiration day.
  return !document.expirationDate || document.expirationDate.toISOString().slice(0, 10) >= now.toISOString().slice(0, 10);
}

export function normalizeCategory(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
