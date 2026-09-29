// Reanimated and worklets need native modules; use their official jest mocks.
jest.mock('react-native-reanimated', () => ({
  ...require('react-native-reanimated/mock'),
  useReducedMotion: () => false,
}));
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
