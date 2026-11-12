export type NumberedPage<T> = { items: T[]; hasNext: boolean };

export function ListPagination({ page, hasNext, loading, onPrevious, onNext }: {
  page: number; hasNext: boolean; loading: boolean; onPrevious: () => void; onNext: () => void;
}) {
  if (page === 1 && !hasNext) return null;
  const button = "rounded-full border border-brand-line bg-white px-3 py-1.5 text-xs font-bold disabled:opacity-50";
  return <div className="flex flex-wrap items-center gap-2">
    <button type="button" className={button} disabled={loading || page === 1} onClick={onPrevious}>Anterior</button>
    <span className="text-xs text-neutral-600">Página {page}</span>
    <button type="button" className={button} disabled={loading || !hasNext} onClick={onNext}>Siguiente</button>
  </div>;
}
