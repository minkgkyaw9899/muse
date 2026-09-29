/** Semantic tokens. The only module that may contain raw palette values (besides global.css, guarded by a test). */
export type ThemeScheme = 'light' | 'dark';

export type SemanticTokens = {
  canvas: string;
  surface: string;
  accent: string;
  onAccent: string;
  text: string;
  mutedText: string;
  separator: string;
  destructive: string;
};

export const palettes: Record<ThemeScheme, SemanticTokens> = {
  light: {
    canvas: '#EAE8E5',
    surface: '#DEC8B5',
    accent: '#9D683B',
    onAccent: '#FFFFFF',
    text: '#000000',
    mutedText: '#4A4038',
    separator: '#B9A899',
    destructive: '#B3261E',
  },
  dark: {
    canvas: '#16130F',
    surface: '#2A211A',
    accent: '#D9A473',
    onAccent: '#000000',
    text: '#F5F0EA',
    mutedText: '#B9ADA1',
    separator: '#5A4C40',
    destructive: '#FF8A80',
  },
};
