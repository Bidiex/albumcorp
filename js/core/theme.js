import { supabase } from './supabase.js';

export async function loadTheme(companyId) {
  const { data, error } = await supabase
    .from('album_theme')
    .select('*')
    .eq('company_id', companyId)
    .single();

  if (error) {
    console.error('Error loading theme:', error);
    return;
  }

  if (data) {
    applyTheme(data);
  }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  
  const map = {
    'page_bg_color': '--color-page-bg',
    'page_border_color': '--color-page-border',
    'page_border_width': '--size-page-border',
    'sticker_empty_bg': '--color-sticker-empty-bg',
    'sticker_empty_border': '--color-sticker-empty-border',
    'sticker_filled_border': '--color-sticker-filled-border',
    'font_family': '--font-primary',
    'primary_text_color': '--color-text-primary',
    'secondary_text_color': '--color-text-secondary',
    'accent_color': '--color-accent',
    'spine_color': '--color-spine',
  };

  Object.entries(map).forEach(([dbKey, cssVar]) => {
    if (theme[dbKey]) {
      root.style.setProperty(cssVar, theme[dbKey]);
    }
  });

  // Especial: font_family si existe
  if (theme.font_family) {
    root.style.setProperty('--font-primary', theme.font_family);
  }
}
