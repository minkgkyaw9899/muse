/** Semantic tokens. The only module that may contain raw palette values (besides global.css, guarded by a test). */
export type ThemeScheme = 'light' | 'dark';

export type SemanticTokens = {
  canvas: string;
  surface: string;
  accent: string;
  text: string;
  mutedText: string;
  separator: string;
  destructive: string;
};

export const palettes: Record<ThemeScheme, SemanticTokens> = {
  light: {
    canvas: '#F3F0EB',
    surface: '#EAE3DA',
    accent: '#A3714A',
    text: '#1F1B17',
    mutedText: '#5C5148',
    separator: '#D9CFC3',
    destructive: '#B3261E',
  },
  dark: {
    canvas: '#1A1714',
    surface: '#26221E',
    accent: '#D9A77E',
    text: '#F1ECE6',
    mutedText: '#B5AAA0',
    separator: '#3A342E',
    destructive: '#FF9A90',
  },
};
