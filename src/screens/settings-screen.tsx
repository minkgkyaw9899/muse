import { useAppTheme } from '@/theme/theme-provider';
import { ListRow } from '@/ui/list-row';
import { Screen } from '@/ui/screen';
import { THEME_LABELS } from './appearance-screen';

export function SettingsScreen({ onOpenAppearance }: { onOpenAppearance: () => void }) {
  const { preference } = useAppTheme();

  return (
    <Screen title="Settings">
      <ListRow
        role="button"
        icon={{ ios: 'paintpalette', android: 'palette', web: 'palette' }}
        title="Appearance"
        value={THEME_LABELS[preference]}
        onPress={onOpenAppearance}
      />
    </Screen>
  );
}
