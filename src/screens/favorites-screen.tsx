import type { PublicationLibrary } from '@/features/library/publication-library';
import { LibraryScreen } from './library-screen';

export function FavoritesScreen({ library }: { library?: PublicationLibrary }) {
  return <LibraryScreen library={library} favoritesOnly />;
}
