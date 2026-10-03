import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { detectTabBarKind } from '@/theme/glass-capability';
import { useAppTheme } from '@/theme/theme-provider';
import { LibraryScreen } from './library-screen';

const glassAvailable = detectTabBarKind() === 'glass';

/** The native search controller owns presentation; LibraryScreen owns its virtualized results. */
export function LibrarySearchScreen() {
  const { tokens } = useAppTheme();
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setRevision((current) => current + 1);
    }, []),
  );

  if (!glassAvailable) return <LibraryScreen />;
  return (
    <>
      <Stack.Title>Search</Stack.Title>
      <Stack.SearchBar
        placement="automatic"
        placeholder="Search Library"
        autoCapitalize="none"
        hideWhenScrolling={false}
        obscureBackground={false}
        tintColor={tokens.accent}
        textColor={tokens.text}
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
        onCancelButtonPress={() => setQuery('')}
      />
      <LibraryScreen searchOnly searchQuery={query} key={revision} />
    </>
  );
}
