import { getConfig } from '@expo/config';

describe('resolved Expo configuration', () => {
  it('resolves the Xcode 27 scene-support plugin', () => {
    const { exp } = getConfig('.', { skipSDKVersionRequirement: false });

    expect(exp.sdkVersion).toBe('57.0.0');
    expect(exp.plugins).toContainEqual([
      'expo-build-properties',
      { ios: { enableSceneSupport: true } },
    ]);
  });
});
