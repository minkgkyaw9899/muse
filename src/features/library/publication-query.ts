import type { Publication } from './publication-library';

export const publicationSortLabels = {
  'imported-desc': 'Recently imported',
  'imported-asc': 'Oldest imported',
  'opened-desc': 'Recently opened',
  'opened-asc': 'Oldest opened',
  'title-asc': 'Title A–Z',
  'title-desc': 'Title Z–A',
} as const;
export type PublicationSort = keyof typeof publicationSortLabels;
export type PublicationQuery = {
  search?: string;
  sort?: PublicationSort;
  recentOnly?: boolean;
};

const compareText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
const normalizedTitle = (publication: Publication) => publication.title.toLocaleLowerCase();

/** Queries a metadata snapshot without mutating it or allocating anything per PDF page. */
export function queryPublications(
  publications: readonly Publication[],
  { search = '', sort = 'imported-desc', recentOnly = false }: PublicationQuery = {},
): Publication[] {
  const query = search.trim().toLocaleLowerCase();
  const rows = publications.filter(
    (publication) =>
      (!recentOnly || publication.lastOpenedAt !== null) &&
      normalizedTitle(publication).includes(query),
  );
  const order = recentOnly ? 'opened-desc' : sort;
  rows.sort((left, right) => {
    const titleOrder = compareText(normalizedTitle(left), normalizedTitle(right));
    const tie = titleOrder || compareText(left.id, right.id);
    if (order === 'title-asc') return tie;
    if (order === 'title-desc') return -titleOrder || compareText(left.id, right.id);
    const opened = order.startsWith('opened');
    const leftDate = opened ? left.lastOpenedAt : left.importedAt;
    const rightDate = opened ? right.lastOpenedAt : right.importedAt;
    // Unopened publications stay last even in the reverse opened order.
    if (leftDate === null || rightDate === null) {
      if (leftDate !== rightDate) return leftDate === null ? 1 : -1;
      return tie;
    }
    const dateOrder = Date.parse(leftDate) - Date.parse(rightDate);
    return (order.endsWith('desc') ? -dateOrder : dateOrder) || tie;
  });
  return recentOnly ? rows.slice(0, 3) : rows;
}
