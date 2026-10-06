import { Button, Host, Image, Menu } from '@expo/ui/swift-ui';
import { accessibilityLabel, buttonStyle, disabled, frame } from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '@/theme/theme-provider';
import type { PublicationMenuProps } from './publication-menu';

/** Keep the trigger and its accessibility label in SwiftUI across metadata updates. */
export function PublicationMenu({
  publication,
  disabled: isDisabled,
  onRename,
  onFavorite,
  onRemove,
}: PublicationMenuProps) {
  const { tokens } = useAppTheme();
  return (
    <Host matchContents ignoreSafeArea="all">
      <Menu
        label={
          <Image
            systemName="ellipsis"
            size={24}
            color={tokens.mutedText}
            modifiers={[frame({ width: 44, height: 44 })]}
          />
        }
        modifiers={[
          buttonStyle('plain'),
          accessibilityLabel(`Publication actions for ${publication.title}`),
          disabled(Boolean(isDisabled)),
        ]}
      >
        <Button label={`Rename ${publication.title}`} onPress={onRename} />
        <Button
          label={`${publication.isFavorite ? 'Unfavorite' : 'Favorite'} ${publication.title}`}
          onPress={onFavorite}
        />
        {/* biome-ignore lint/a11y/useValidAriaRole: Expo SwiftUI Button uses native ButtonRole, not ARIA. */}
        <Button label={`Remove ${publication.title}`} role="destructive" onPress={onRemove} />
      </Menu>
    </Host>
  );
}
