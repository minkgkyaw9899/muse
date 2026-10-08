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

/** Queries a metadata snapshot without mutating it or allocating anything per PDF page. */
export function queryPublications(
  publications: readonly Publication[],
  { search = '', sort = 'imported-desc', recentOnly = false }: PublicationQuery = {},
): Publication[] {
  const query = search.trim().toLocaleLowerCase();
  const order = recentOnly ? 'opened-desc' : sort;
  const opened = order.startsWith('opened');
  const byTitle = order.startsWith('title');
  const rows = publications.flatMap((publication) => {
    if (recentOnly && publication.lastOpenedAt === null) return [];
    const title = publication.title.toLocaleLowerCase();
    if (!title.includes(query)) return [];
    const date = opened ? publication.lastOpenedAt : publication.importedAt;
    return [{ publication, title, date: date === null ? null : byTitle ? 0 : Date.parse(date) }];
  });
  rows.sort((left, right) => {
    const titleOrder = compareText(left.title, right.title);
    const tie = titleOrder || compareText(left.publication.id, right.publication.id);
    if (order === 'title-asc') return tie;
    if (order === 'title-desc')
      return -titleOrder || compareText(left.publication.id, right.publication.id);
    const leftDate = left.date;
    const rightDate = right.date;
    // Unopened publications stay last even in the reverse opened order.
    if (leftDate === null || rightDate === null) {
      if (leftDate !== rightDate) return leftDate === null ? 1 : -1;
      return tie;
    }
    const dateOrder = leftDate - rightDate;
    return (order.endsWith('desc') ? -dateOrder : dateOrder) || tie;
  });
  return (recentOnly ? rows.slice(0, 3) : rows).map((row) => row.publication);
}
