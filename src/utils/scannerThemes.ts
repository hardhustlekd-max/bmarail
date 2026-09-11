import { ScannerResultTheme } from '../types';

export type ScannerThemeKey = ScannerResultTheme;

export interface ScannerThemeConfig {
  id: ScannerResultTheme;
  nameEn: string;
  nameAm: string;
  badgeEn: string;
  badgeAm: string;
  descriptionEn: string;
  descriptionAm: string;
  palette: string[]; // Color hexes for preview swatch

  // Outer modal / page container background
  containerBg: string;

  // Scrollable middle body container background
  bodyBg: string;

  // Primary card container (general fallback)
  cardBg: string;

  // Owner Info Card (Card 1) specific styling
  ownerCardBg: string;

  // Additional Vehicle Specs Card (Card 2) specific styling
  specCardBg: string;

  // Data chips / mini item tiles in the 2-column grid
  chipBg: string;

  // Round badge/avatar icon circles
  iconCircle: string;

  // Action button styling
  actionButton: string;

  // Plate number pill badge
  plateBadge: string;

  // Owner Name & Section Heading typography
  headingText: string;

  // Label text (small description)
  labelText: string;

  // Value text (bold content)
  valueText: string;

  // Sub-City & Info Highlight Icon colors
  sectionIconColor: string;

  // Verification Header dynamic background classes
  headerApproved: string;
  headerPending: string;
  headerRejected: string;

  // Document preview placeholder cards
  docCardBg: string;
  docCardBorder: string;

  // Bottom copyright footer text
  footerText: string;
}

export const SCANNER_THEMES: Record<ScannerResultTheme, ScannerThemeConfig> = {
  // ATTACHMENT 1 EXACT MATCH (20260909_154449.jpg)
  deep_cobalt_navy: {
    id: 'deep_cobalt_navy',
    nameEn: 'Deep Cobalt Navy (From Attachment 1)',
    nameAm: 'ጥቁር ኮባልት ሰማያዊ (ከፎቶ 1 የተወሰደ)',
    badgeEn: 'Attachment 1 Exact',
    badgeAm: 'ፎቶ 1 ትክክለኛ',
    descriptionEn: 'Exact replica of Attachment 1: deep royal/cobalt blue canvas, midnight navy cards, gold circle indicators, and crisp white typography.',
    descriptionAm: 'የአባሪ 1 ትክክለኛ ገጽታ፡ ጥቁር ኮባልት ሰማያዊ ዳራ፣ ጥቁር ሰማያዊ ካርዶች፣ ወርቃማ ክብ አርማዎች እና ንጹህ ነጭ ጽሁፍ።',
    palette: ['#0a1c44', '#0f295e', '#122e6b', '#fbbf24', '#22c55e'],

    containerBg: 'bg-[#0b1e48]',
    bodyBg: 'bg-[#0c2353]',
    cardBg: 'bg-[#102a63] border-2 border-[#1a3e87] text-white',
    ownerCardBg: 'bg-[#102a63] border-2 border-[#1a3e87] text-white',
    specCardBg: 'bg-[#102a63] border-2 border-[#1a3e87] text-white',
    chipBg: 'bg-[#122e6b] border border-[#1a3f8a] text-white',
    iconCircle: 'bg-[#0a1c44] text-amber-400 border border-amber-500/30 shadow-xs',
    actionButton: 'bg-[#102a63] hover:bg-[#16377e] text-amber-300 border border-amber-500/40 shadow-xs',
    plateBadge: 'bg-[#0a1c44] text-blue-200 border border-blue-600/60',
    headingText: 'text-white',
    labelText: 'text-blue-200/90',
    valueText: 'text-white',
    sectionIconColor: 'text-blue-300',

    headerApproved: 'bg-emerald-600 border-emerald-600 text-white',
    headerPending: 'bg-amber-500 border-amber-500 text-white',
    headerRejected: 'bg-rose-600 border-rose-600 text-white',

    docCardBg: 'bg-[#122e6b] hover:bg-[#16377e]',
    docCardBorder: 'border border-[#1a3f8a]',
    footerText: 'text-blue-300/80',
  },

  // ATTACHMENT 2 EXACT MATCH (20260909_154017.jpg)
  warm_ivory_cream: {
    id: 'warm_ivory_cream',
    nameEn: 'Warm Ivory & Crisp White (From Attachment 2)',
    nameAm: 'ሞቃት አይቮሪ ክሬም እና ነጭ (ከፎቶ 2 የተወሰደ)',
    badgeEn: 'Attachment 2 Exact',
    badgeAm: 'ፎቶ 2 ትክክለኛ',
    descriptionEn: 'Exact replica of Attachment 2: soft light slate canvas, warm ivory cream owner card, and pure white informational tiles.',
    descriptionAm: 'የአባሪ 2 ትክክለኛ ገጽታ፡ ለስላሳ ስሌት ዳራ፣ ሞቃት አይቮሪ የባለቤት ካርድ እና ንጹህ ነጭ የመረጃ ሳጥኖች።',
    palette: ['#eef2f6', '#fcf8eb', '#ffffff', '#0f172a', '#15803d'],

    containerBg: 'bg-[#eef2f6]',
    bodyBg: 'bg-[#eef2f6]',
    cardBg: 'bg-[#fcf8eb] border border-[#e8e1cb] text-slate-900',
    ownerCardBg: 'bg-[#fcf8eb] border border-[#e8e1cb] text-slate-900',
    specCardBg: 'bg-[#eef2f6] border border-slate-200 text-slate-900',
    chipBg: 'bg-white border border-slate-200/90 shadow-2xs text-slate-900',
    iconCircle: 'bg-slate-200 text-slate-800 border border-slate-300/60 shadow-2xs',
    actionButton: 'bg-[#0B1E48] hover:bg-[#162B5B] text-white shadow-xs',
    plateBadge: 'bg-white text-slate-900 border border-slate-300 shadow-2xs',
    headingText: 'text-slate-900',
    labelText: 'text-slate-500',
    valueText: 'text-slate-900',
    sectionIconColor: 'text-slate-800',

    headerApproved: 'bg-[#15803d] border-[#15803d] text-white',
    headerPending: 'bg-amber-500 border-amber-500 text-white',
    headerRejected: 'bg-rose-600 border-rose-600 text-white',

    docCardBg: 'bg-white hover:bg-slate-50',
    docCardBorder: 'border border-slate-200',
    footerText: 'text-slate-500',
  },

  // ATTACHMENT 3 EXACT MATCH (20260909_154014.jpg)
  soft_ice_blue: {
    id: 'soft_ice_blue',
    nameEn: 'Soft Ice Blue & Crisp White (From Attachment 3)',
    nameAm: 'በረዶ ሰማያዊ እና ነጭ (ከፎቶ 3 የተወሰደ)',
    badgeEn: 'Attachment 3 Exact',
    badgeAm: 'ፎቶ 3 ትክክለኛ',
    descriptionEn: 'Exact replica of Attachment 3: soft light slate canvas, pastel ice-blue owner card with subtle divider, and crisp white tiles.',
    descriptionAm: 'የአባሪ 3 ትክክለኛ ገጽታ፡ ለስላሳ ስሌት ዳራ፣ ውብ ሰማያዊ የባለቤት ካርድ እና ንጹህ ነጭ የመረጃ ሳጥኖች።',
    palette: ['#eef2f6', '#dbeafe', '#ffffff', '#0f172a', '#15803d'],

    containerBg: 'bg-[#eef2f6]',
    bodyBg: 'bg-[#eef2f6]',
    cardBg: 'bg-[#dbeafe] border border-blue-200 text-slate-900',
    ownerCardBg: 'bg-[#dbeafe] border border-blue-200 text-slate-900',
    specCardBg: 'bg-[#eef2f6] border border-slate-200 text-slate-900',
    chipBg: 'bg-white border border-slate-200/90 shadow-2xs text-slate-900',
    iconCircle: 'bg-slate-200 text-slate-800 border border-slate-300/60 shadow-2xs',
    actionButton: 'bg-[#0B1E48] hover:bg-[#162B5B] text-white shadow-xs',
    plateBadge: 'bg-white text-slate-900 border border-slate-300 shadow-2xs',
    headingText: 'text-slate-900',
    labelText: 'text-slate-500',
    valueText: 'text-slate-900',
    sectionIconColor: 'text-slate-800',

    headerApproved: 'bg-[#15803d] border-[#15803d] text-white',
    headerPending: 'bg-amber-500 border-amber-500 text-white',
    headerRejected: 'bg-rose-600 border-rose-600 text-white',

    docCardBg: 'bg-white hover:bg-slate-50',
    docCardBorder: 'border border-slate-200',
    footerText: 'text-slate-500',
  },

  classic_blue: {
    id: 'classic_blue',
    nameEn: 'Classic Azure & Navy',
    nameAm: 'ክላሲክ ሰማያዊና ባህር ኃይል',
    badgeEn: 'Classic Blue',
    badgeAm: 'ክላሲክ ሰማያዊ',
    descriptionEn: 'Standard municipal inspection theme with sky blue canvas, deep navy accents, and amber indicators.',
    descriptionAm: 'የተለመደው የማዘጋጃ ቤት ሰማያዊ ዳራ፣ ጥቁር ሰማያዊ ባጆች እና ወርቃማ አመልካቾች።',
    palette: ['#dbeafe', '#bfdbfe', '#0B1E48', '#f59e0b', '#059669'],

    containerBg: 'bg-blue-100 dark:bg-slate-950',
    bodyBg: 'bg-blue-100 dark:bg-blue-950/80',
    cardBg: 'bg-blue-200 dark:bg-blue-900/80 border-2 border-blue-300 dark:border-blue-700 text-slate-950 dark:text-white',
    ownerCardBg: 'bg-blue-200 dark:bg-blue-900/80 border-2 border-blue-300 dark:border-blue-700 text-slate-950 dark:text-white',
    specCardBg: 'bg-blue-200 dark:bg-blue-900/80 border-2 border-blue-300 dark:border-blue-700 text-slate-950 dark:text-white',
    chipBg: 'bg-blue-100/60 dark:bg-blue-950/40 border border-blue-300/60 dark:border-blue-700/60',
    iconCircle: 'bg-[#0B1E48] text-amber-400 border border-amber-500/30 shadow-xs',
    actionButton: 'bg-[#0B1E48] hover:bg-[#071330] text-amber-300 border border-amber-500/40 shadow-xs',
    plateBadge: 'bg-blue-50 dark:bg-blue-950/60 text-[#0B1E48] dark:text-blue-300 border border-blue-300 dark:border-blue-700',
    headingText: 'text-slate-950 dark:text-white',
    labelText: 'text-slate-700 dark:text-slate-300',
    valueText: 'text-slate-950 dark:text-white',
    sectionIconColor: 'text-[#0B1E48] dark:text-blue-400',

    headerApproved: 'bg-emerald-600 border-emerald-600 text-white',
    headerPending: 'bg-amber-500 border-amber-500 text-white',
    headerRejected: 'bg-rose-600 border-rose-600 text-white',

    docCardBg: 'bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100',
    docCardBorder: 'border border-slate-200 dark:border-slate-700',
    footerText: 'text-slate-500',
  },

  emerald_law: {
    id: 'emerald_law',
    nameEn: 'Emerald Law & Patrol (Forest Green)',
    nameAm: 'ኤመራልድ አረንጓዴ የህግ ማስከበር (Emerald Law)',
    badgeEn: 'Patrol Special',
    badgeAm: 'የጥበቃ ልዩ',
    descriptionEn: 'Forest green authority theme with soft sage canvas, emerald container cards, and lime/gold badges.',
    descriptionAm: 'አረንጓዴ የህግ ማስከበሪያ ገጽታ፣ የሳር አረንጓዴ ካርዶች እና ወርቃማ አርማዎች።',
    palette: ['#d1fae5', '#a7f3d0', '#064e3b', '#34d399', '#10b981'],

    containerBg: 'bg-emerald-100/70 dark:bg-slate-950',
    bodyBg: 'bg-emerald-50 dark:bg-emerald-950/60',
    cardBg: 'bg-emerald-100 dark:bg-emerald-900/80 border-2 border-emerald-300 dark:border-emerald-700 text-emerald-950 dark:text-emerald-50',
    ownerCardBg: 'bg-emerald-100 dark:bg-emerald-900/80 border-2 border-emerald-300 dark:border-emerald-700 text-emerald-950 dark:text-emerald-50',
    specCardBg: 'bg-emerald-100 dark:bg-emerald-900/80 border-2 border-emerald-300 dark:border-emerald-700 text-emerald-950 dark:text-emerald-50',
    chipBg: 'bg-emerald-50/80 dark:bg-emerald-950/50 border border-emerald-300/60 dark:border-emerald-700/60',
    iconCircle: 'bg-[#064e3b] text-emerald-300 border border-emerald-400/30 shadow-xs',
    actionButton: 'bg-[#064e3b] hover:bg-[#022c22] text-emerald-200 border border-emerald-500/40 shadow-xs',
    plateBadge: 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700',
    headingText: 'text-emerald-950 dark:text-white',
    labelText: 'text-emerald-800 dark:text-emerald-300',
    valueText: 'text-emerald-950 dark:text-white',
    sectionIconColor: 'text-emerald-800 dark:text-emerald-400',

    headerApproved: 'bg-emerald-700 border-emerald-700 text-white',
    headerPending: 'bg-amber-600 border-amber-600 text-white',
    headerRejected: 'bg-rose-700 border-rose-700 text-white',

    docCardBg: 'bg-emerald-50/80 dark:bg-emerald-950/50 hover:bg-emerald-100/80',
    docCardBorder: 'border border-emerald-200 dark:border-emerald-800',
    footerText: 'text-emerald-700 dark:text-emerald-300',
  },

  tactical_dark: {
    id: 'tactical_dark',
    nameEn: 'Tactical Obsidian & Gold (Field Night)',
    nameAm: 'ታክቲካል ጥቁር እና ወርቅ (Tactical Obsidian)',
    badgeEn: 'Night Patrol',
    badgeAm: 'የምሽት ፍተሻ',
    descriptionEn: 'High-contrast dark stealth theme tailored for night patrols with jet obsidian canvas, graphite cards, and vivid gold accents.',
    descriptionAm: 'ለሊት ፍተሻ የተዘጋጀ ጥቁር እና ወርቃማ ከፍተኛ ንፅፅር ያለው የጥበቃ ገጽታ።',
    palette: ['#0f172a', '#1e293b', '#f59e0b', '#38bdf8', '#22c55e'],

    containerBg: 'bg-slate-950 dark:bg-black',
    bodyBg: 'bg-slate-950 dark:bg-black',
    cardBg: 'bg-slate-900 border-2 border-slate-700 text-slate-100',
    ownerCardBg: 'bg-slate-900 border-2 border-slate-700 text-slate-100',
    specCardBg: 'bg-slate-900 border-2 border-slate-700 text-slate-100',
    chipBg: 'bg-slate-800/90 border border-slate-700/80',
    iconCircle: 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-xs',
    actionButton: 'bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/40 shadow-xs',
    plateBadge: 'bg-slate-950 text-amber-300 border border-amber-500/50',
    headingText: 'text-white',
    labelText: 'text-slate-400',
    valueText: 'text-slate-100',
    sectionIconColor: 'text-amber-400',

    headerApproved: 'bg-slate-900 border-b-2 border-emerald-500 text-white',
    headerPending: 'bg-slate-900 border-b-2 border-amber-500 text-white',
    headerRejected: 'bg-slate-900 border-b-2 border-rose-500 text-white',

    docCardBg: 'bg-slate-900 hover:bg-slate-800',
    docCardBorder: 'border border-slate-700',
    footerText: 'text-slate-400',
  },

  imperial_gold: {
    id: 'imperial_gold',
    nameEn: 'Amhara Heritage & Imperial Gold',
    nameAm: 'የአማራ ቅርስ እና ወርቃማ ገጽታ (Heritage Gold)',
    badgeEn: 'Heritage',
    badgeAm: 'ባህላዊ ቅርስ',
    descriptionEn: 'Regal warm parchment theme inspired by Ethiopian authority seals with bronze borders, rich gold cards, and crimson highlights.',
    descriptionAm: 'የኢትዮጵያ ማህተም እና ቅርስ የተላበሰ ወርቃማ እና ቀይ ድምቀት ያለው ገጽታ።',
    palette: ['#fef3c7', '#fde68a', '#7f1d1d', '#b45309', '#f59e0b'],

    containerBg: 'bg-amber-100/60 dark:bg-stone-950',
    bodyBg: 'bg-amber-50 dark:bg-stone-950',
    cardBg: 'bg-amber-200/80 dark:bg-amber-950/70 border-2 border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-50',
    ownerCardBg: 'bg-amber-200/80 dark:bg-amber-950/70 border-2 border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-50',
    specCardBg: 'bg-amber-200/80 dark:bg-amber-950/70 border-2 border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-50',
    chipBg: 'bg-amber-100/70 dark:bg-stone-900/60 border border-amber-300/60 dark:border-amber-700/60',
    iconCircle: 'bg-[#7f1d1d] text-amber-300 border border-amber-400/40 shadow-xs',
    actionButton: 'bg-[#7f1d1d] hover:bg-[#5b1414] text-amber-300 border border-amber-500/40 shadow-xs',
    plateBadge: 'bg-amber-50 dark:bg-stone-900 text-[#7f1d1d] dark:text-amber-300 border border-amber-400',
    headingText: 'text-amber-950 dark:text-amber-100',
    labelText: 'text-amber-900 dark:text-amber-300',
    valueText: 'text-amber-950 dark:text-stone-100',
    sectionIconColor: 'text-[#7f1d1d] dark:text-amber-400',

    headerApproved: 'bg-[#7f1d1d] border-[#991b1b] text-white',
    headerPending: 'bg-amber-700 border-amber-800 text-white',
    headerRejected: 'bg-rose-800 border-rose-900 text-white',

    docCardBg: 'bg-amber-50/80 dark:bg-stone-900/60 hover:bg-amber-100/80',
    docCardBorder: 'border border-amber-300 dark:border-amber-800',
    footerText: 'text-amber-800 dark:text-amber-300',
  },

  modern_clean: {
    id: 'modern_clean',
    nameEn: 'Modern Crisp Slate & Indigo',
    nameAm: 'ዘመናዊ ንጹህ ስሌት እና ኢንዲጎ (Clean Slate)',
    badgeEn: 'Clean UI',
    badgeAm: 'ንጹህ ዘይቤ',
    descriptionEn: 'Sleek contemporary municipal card theme with pure white surfaces, subtle slate borders, and crisp indigo accents.',
    descriptionAm: 'ዘመናዊ ንጹህ ነጭ እና ስሌት ዳራ ያለው ቀላል እና ግልጽ የፍተሻ ገጽታ።',
    palette: ['#f8fafc', '#ffffff', '#312e81', '#38bdf8', '#4338ca'],

    containerBg: 'bg-slate-100 dark:bg-slate-950',
    bodyBg: 'bg-slate-100 dark:bg-slate-950',
    cardBg: 'bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 text-slate-950 dark:text-white',
    ownerCardBg: 'bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 text-slate-950 dark:text-white',
    specCardBg: 'bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 text-slate-950 dark:text-white',
    chipBg: 'bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700',
    iconCircle: 'bg-indigo-900 text-sky-300 border border-indigo-700 shadow-xs',
    actionButton: 'bg-indigo-900 hover:bg-indigo-950 text-sky-200 border border-indigo-700 shadow-xs',
    plateBadge: 'bg-slate-100 dark:bg-slate-800 text-indigo-900 dark:text-indigo-300 border border-slate-300 dark:border-slate-600',
    headingText: 'text-slate-950 dark:text-white',
    labelText: 'text-slate-600 dark:text-slate-400',
    valueText: 'text-slate-950 dark:text-white',
    sectionIconColor: 'text-indigo-700 dark:text-indigo-400',

    headerApproved: 'bg-indigo-700 border-indigo-800 text-white',
    headerPending: 'bg-amber-600 border-amber-700 text-white',
    headerRejected: 'bg-rose-700 border-rose-800 text-white',

    docCardBg: 'bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100',
    docCardBorder: 'border border-slate-200 dark:border-slate-700',
    footerText: 'text-slate-500',
  },
};

export const DEFAULT_SCANNER_THEME: ScannerResultTheme = 'deep_cobalt_navy';

export function getScannerTheme(themeKey?: string | ScannerResultTheme): ScannerThemeConfig {
  if (themeKey && themeKey in SCANNER_THEMES) {
    return SCANNER_THEMES[themeKey as ScannerResultTheme];
  }
  return SCANNER_THEMES[DEFAULT_SCANNER_THEME];
}
