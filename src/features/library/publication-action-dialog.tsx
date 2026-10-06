import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/theme-provider';
import { ScrollList } from '@/ui/scroll-list';
import type { Publication, RemovalResult, RenameResult } from './publication-library';

export type PublicationAction = {
  kind: 'rename' | 'remove';
  publication: Publication;
  count?: number;
};

/** One active dialog per collection; drafts survive errors and close only on a durable result. */
export function PublicationActionDialog({
  action,
  onDismiss,
  onSubmit,
}: {
  action: PublicationAction;
  onDismiss(): void;
  onSubmit(title: string): Promise<RenameResult | RemovalResult>;
}) {
  const { tokens } = useAppTheme();
  const countLabel =
    action.count === undefined
      ? null
      : `${action.count} ${action.count === 1 ? 'publication' : 'publications'}`;
  const [draft, setDraft] = useState(action.publication.title);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (Platform.OS === 'ios' && error) AccessibilityInfo.announceForAccessibility(error);
  }, [error]);
  async function submit() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await onSubmit(draft);
      if (!active.current) return;
      if (result.status === 'error') setError(result.error.message);
      else onDismiss();
    } catch {
      if (active.current)
        setError(`Muse could not ${action.kind} this publication. Please try again.`);
    } finally {
      if (active.current) setPending(false);
    }
  }
  return (
    <Modal
      visible
      animationType="none"
      onRequestClose={() => {
        if (!pending) onDismiss();
      }}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.canvas }} accessibilityViewIsModal>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollList
            style={{ flex: 1 }}
            data={[]}
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="grow px-5 py-6"
            ListHeaderComponent={
              <View className="gap-4">
                <Text accessibilityRole="header" className="font-bold text-2xl text-text">
                  {action.kind === 'rename'
                    ? 'Rename publication'
                    : countLabel
                      ? `Remove ${countLabel}?`
                      : 'Remove one publication?'}
                </Text>
                <Text selectable className="text-lg text-text">
                  {countLabel ? `${countLabel} selected` : action.publication.title}
                </Text>
                {action.kind === 'rename' ? (
                  <>
                    <Text className="text-base text-muted-text">Displayed title</Text>
                    <TextInput
                      accessibilityLabel="Publication title"
                      value={draft}
                      onChangeText={setDraft}
                      editable={!pending}
                      autoFocus
                      selectTextOnFocus
                      returnKeyType="done"
                      onSubmitEditing={() => {
                        void submit();
                      }}
                      placeholderTextColor={tokens.mutedText}
                      className="min-h-11 rounded-xl border border-separator bg-surface px-4 py-3 text-base text-text"
                    />
                  </>
                ) : (
                  <Text selectable className="text-base text-muted-text">
                    {countLabel
                      ? 'This removes the selected publications and their saved data from Muse. Originals in Files are kept. This cannot be undone.'
                      : 'This removes this publication and its saved data from Muse. The original in Files is kept. This cannot be undone.'}
                  </Text>
                )}
                {error ? (
                  <Text
                    selectable
                    accessibilityLiveRegion="assertive"
                    className="text-base text-destructive"
                  >
                    {error}
                  </Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    action.kind === 'rename'
                      ? 'Save title'
                      : `Confirm removal of ${countLabel ?? action.publication.title}`
                  }
                  disabled={pending}
                  accessibilityState={{ disabled: pending, busy: pending }}
                  onPress={() => {
                    void submit();
                  }}
                  className="min-h-11 justify-center rounded-xl border border-separator bg-surface px-4 py-3 active:opacity-60"
                >
                  <Text
                    className={
                      action.kind === 'remove'
                        ? 'text-base text-destructive'
                        : 'text-accent-text text-base'
                    }
                  >
                    {pending ? 'Saving…' : action.kind === 'rename' ? 'Save' : 'Remove'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={action.kind === 'rename' ? 'Cancel rename' : 'Cancel removal'}
                  disabled={pending}
                  accessibilityState={{ disabled: pending }}
                  onPress={onDismiss}
                  className="min-h-11 justify-center px-4 py-3"
                >
                  <Text className="text-accent-text text-base">Cancel</Text>
                </Pressable>
              </View>
            }
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
