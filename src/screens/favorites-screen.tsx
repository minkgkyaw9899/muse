import { EmptyState } from '@/ui/empty-state';
import { Screen } from '@/ui/screen';

export function FavoritesScreen() {
  return (
    <Screen title="Favorites">
      <EmptyState
        icon={{ ios: 'heart', android: 'favorite', web: 'favorite' }}
        title="No favorites yet"
        description="Mark a publication as a favorite to find it here quickly."
      />
    </Screen>
  );
}
