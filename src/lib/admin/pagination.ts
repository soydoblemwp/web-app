/** Every admin list page uses server-side pagination — never a full table load. */
export const ADMIN_PAGE_SIZE = 50;

export function parsePage(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

export function paginationSkip(page: number): number {
  return (page - 1) * ADMIN_PAGE_SIZE;
}

export function totalPages(totalCount: number): number {
  return Math.max(1, Math.ceil(totalCount / ADMIN_PAGE_SIZE));
}
