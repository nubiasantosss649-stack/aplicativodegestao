/** Remove caracteres com significado especial nos filtros do PostgREST. */
export function sanitizeSearch(term: string): string {
  return term.replace(/[%,()*\\:"']/g, ' ').trim().slice(0, 60);
}
