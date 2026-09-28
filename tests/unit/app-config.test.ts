import appConfig from '../../app.json';

describe('native build configuration', () => {
  it('enables SDK 57 scene lifecycle support for Xcode 27', () => {
    expect(appConfig.expo.plugins).toContainEqual([
      'expo-build-properties',
      { ios: { enableSceneSupport: true } },
    ]);
  });
});
