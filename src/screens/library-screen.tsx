import { EmptyState } from '@/ui/empty-state';
import { Screen } from '@/ui/screen';

export function LibraryScreen() {
  return (
    <Screen title="Library">
      <EmptyState
        icon={{ ios: 'books.vertical', android: 'library_books', web: 'library_books' }}
        title="Your library is empty"
        description="Publications you import will appear here."
      />
    </Screen>
  );
}
