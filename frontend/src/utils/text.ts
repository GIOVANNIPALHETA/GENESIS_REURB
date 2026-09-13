/**
 * Normaliza strings para busca insensível a maiúsculas/minúsculas e acentuação (diacríticos).
 * Ex: "João" -> "joao", "VALADARES" -> "valadares", "Chácara" -> "chacara"
 */
export function normalizeText(value?: string | null): string {
  if (!value) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

