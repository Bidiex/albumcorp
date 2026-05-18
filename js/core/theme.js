import { supabase } from './supabase.js';

const PALETTES = {
  obsidiana: {
    '--color-album-bg':        '#0D0D0D',
    '--color-page-bg':         '#1A1A1A',
    '--color-spine':           '#111111',
    '--color-accent':          '#22C55E',
    '--color-text-primary':    '#F8FAFC',
    '--color-text-secondary':  '#94A3B8',
    '--color-sticker-empty-bg':'#1E1E1E',
    '--color-nav-btn':         '#1E1E1E',
    '--color-nav-btn-text':    '#F8FAFC',
    '--color-action-primary':  '#22C55E',
    '--color-action-secondary':'#3B82F6',
    '--color-shadow':          '#000000',
    '--primary':               '#22C55E',
  },
  pergamino: {
    '--color-album-bg':        '#EDE8DF',
    '--color-page-bg':         '#F7F4EF',
    '--color-spine':           '#2C2416',
    '--color-accent':          '#C8A96E',
    '--color-text-primary':    '#2C2416',
    '--color-text-secondary':  '#7A6E5F',
    '--color-sticker-empty-bg':'#E8E2D9',
    '--color-nav-btn':         '#FFFFFF',
    '--color-nav-btn-text':    '#2F3B52',
    '--color-action-primary':  '#C8A96E',
    '--color-action-secondary':'#8B8075',
    '--color-shadow':          '#2F3B52',
    '--primary':               '#C8A96E',
  },
  indigo: {
    '--color-album-bg':        '#0D0D1A',
    '--color-page-bg':         '#12122A',
    '--color-spine':           '#0A0A1F',
    '--color-accent':          '#7C3AED',
    '--color-text-primary':    '#F0EEFF',
    '--color-text-secondary':  '#A78BFA',
    '--color-sticker-empty-bg':'#1A1A35',
    '--color-nav-btn':         '#1A1A35',
    '--color-nav-btn-text':    '#7C3AED',
    '--color-action-primary':  '#7C3AED',
    '--color-action-secondary':'#4F46E5',
    '--color-shadow':          '#000033',
    '--primary':               '#7C3AED',
  },
  mercurio: {
    '--color-album-bg':        '#111111',
    '--color-page-bg':         '#1C1C1E',
    '--color-spine':           '#0A0A0A',
    '--color-accent':          '#E2E8F0',
    '--color-text-primary':    '#F8FAFC',
    '--color-text-secondary':  '#94A3B8',
    '--color-sticker-empty-bg':'#2A2A2A',
    '--color-nav-btn':         '#2A2A2A',
    '--color-nav-btn-text':    '#E2E8F0',
    '--color-action-primary':  '#475569',
    '--color-action-secondary':'#334155',
    '--color-shadow':          '#000000',
    '--primary':               '#64748B',
  },
  ambar: {
    '--color-album-bg':        '#0D0900',
    '--color-page-bg':         '#1A1000',
    '--color-spine':           '#0D0800',
    '--color-accent':          '#F59E0B',
    '--color-text-primary':    '#FEF3C7',
    '--color-text-secondary':  '#D97706',
    '--color-sticker-empty-bg':'#1F1500',
    '--color-nav-btn':         '#1F1500',
    '--color-nav-btn-text':    '#F59E0B',
    '--color-action-primary':  '#F59E0B',
    '--color-action-secondary':'#D97706',
    '--color-shadow':          '#000000',
    '--primary':               '#F59E0B',
  }
};

export async function loadTheme(companyId) {
  const { data, error } = await supabase
    .from('album_theme')
    .select('*')
    .eq('company_id', companyId)
    .single();

  if (error) {
    console.error('Error loading theme:', error);
    return null;
  }

  if (data) {
    applyTheme(data);
  }

  return data || null;
}

export function applyTheme(theme) {
  const root = document.documentElement;
  const paletteName = theme.palette_name || 'obsidiana';
  const palette = PALETTES[paletteName] || PALETTES.obsidiana;

  Object.entries(palette).forEach(([cssVar, value]) => {
    root.style.setProperty(cssVar, value);
  });

  // page_border_width sigue siendo configurable
  if (theme.page_border_width) {
    root.style.setProperty('--size-page-border', theme.page_border_width + 'px');
  }
}

export { PALETTES };
