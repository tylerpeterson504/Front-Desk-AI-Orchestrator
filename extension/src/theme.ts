// Front Desk AI — theme switcher for the side panel.
//
// All panel colors flow from CSS custom properties on :root. This file owns the
// theme palette: it applies the saved theme as early as possible (to avoid a
// flash), wires the header swatch + custom color picker, and persists the
// choice to chrome.storage.local so it survives reloads.
//
// Loaded before sidepanel.js so the theme is in place before the panel renders.
// Tests do not load this file; it is safe to use chrome.* and the DOM here, but
// every DOM lookup is null-guarded so a missing element never throws.

interface Theme {
  accent: string;
  accent2: string;
  accentSoft: string;
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  faint: string;
  line: string;
  lineStrong: string;
  headerFrom: string;
  headerTo: string;
  rail: string;
  railSoft: string;
  dark: string;
}

const THEMES: Record<string, Theme> = {
  frenchQuarter:  { accent: '#c1440e', accent2: '#e8b75e', accentSoft: '#fbeee2', bg: '#f3efe6', surface: '#ffffff', ink: '#20211f', muted: '#6b675e', faint: '#a8a298', line: '#e4ddcf', lineStrong: '#cdbfa6', headerFrom: '#234346', headerTo: '#0f2628', rail: '#e8b75e', railSoft: '#b8902f', dark: '#1f3a3d' },
  mardiGras:      { accent: '#7b2e9e', accent2: '#e8b75e', accentSoft: '#f3e8fb', bg: '#f4f0f7', surface: '#ffffff', ink: '#211a2a', muted: '#6b5e7a', faint: '#a89bb6', line: '#e7dcee', lineStrong: '#d2c2dc', headerFrom: '#3a1d4d', headerTo: '#1a0e2e', rail: '#e8b75e', railSoft: '#b8902f', dark: '#2a1640' },
  gardenDistrict:{ accent: '#3f7d4e', accent2: '#c98a1b', accentSoft: '#e9f3ec', bg: '#f2f4ee', surface: '#ffffff', ink: '#1f2a20', muted: '#5f6b5e', faint: '#9ba89a', line: '#dde6dc', lineStrong: '#c4d0c2', headerFrom: '#2c4a30', headerTo: '#162a1c', rail: '#c98a1b', railSoft: '#9a6a12', dark: '#22401f' },
  midnightBourbon:{ accent: '#d4a84b', accent2: '#8b6f3f', accentSoft: '#f6efd9', bg: '#15131c', surface: '#211e2a', ink: '#ece8f5', muted: '#9b94aa', faint: '#6b6478', line: '#332f40', lineStrong: '#45405a', headerFrom: '#1a1620', headerTo: '#0a0810', rail: '#d4a84b', railSoft: '#9a7a30', dark: '#15131c' },
  cafeDuMonde:   { accent: '#3b2a1a', accent2: '#e8b75e', accentSoft: '#f3e9d8', bg: '#f4ede0', surface: '#ffffff', ink: '#241d12', muted: '#6b5d49', faint: '#a89878', line: '#e6dac4', lineStrong: '#cdba96', headerFrom: '#3b2a1a', headerTo: '#1f140b', rail: '#e8b75e', railSoft: '#b8902f', dark: '#241d12' },
  bourbonStreet: { accent: '#7b1e1e', accent2: '#e8b75e', accentSoft: '#fbe9e6', bg: '#f5eeea', surface: '#ffffff', ink: '#241a1a', muted: '#6b5454', faint: '#a88686', line: '#e8d8d4', lineStrong: '#d0b0ac', headerFrom: '#5a1818', headerTo: '#2a0d0d', rail: '#e8b75e', railSoft: '#b8902f', dark: '#3a1010' }
};

const root = document.documentElement;

function applyTheme(name: string): void {
  const t = THEMES[name] || THEMES.frenchQuarter;
  for (const [k, v] of Object.entries(t)) {
    root.style.setProperty('--' + k, v);
  }
  root.setAttribute('data-theme', name);
}

function markSwatchActive(name: string | null): void {
  const bar = document.getElementById('theme-row');
  if (!bar) return;
  bar.querySelectorAll('.swatch').forEach((sw) => {
    sw.classList.toggle('active', sw.dataset.theme === name);
  });
}

// Apply the default immediately so the panel never flashes unstyled.
applyTheme('frenchQuarter');

// Restore the saved theme (and a custom accent, if set).
function restore(): void {
  try {
    const hasStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
    if (!hasStorage) return;
    chrome.storage.local.get(['theme', 'accent'], ({ theme, accent }) => {
      if (theme && THEMES[theme as string]) {
        applyTheme(theme as string);
        markSwatchActive(theme as string);
      } else if (theme === 'custom' && accent) {
        applyTheme('frenchQuarter');
        root.style.setProperty('--accent', accent as string);
        root.style.setProperty('--accent2', accent as string);
        markSwatchActive(null);
      }
    });
  } catch {
    // chrome.storage unavailable — keep the default already applied.
  }
}
restore();

function persistTheme(name: string): void {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ theme: name, accent: undefined });
    }
  } catch {
    // ignore — theme still applies for this session
  }
}

function persistCustom(color: string): void {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ theme: 'custom', accent: color });
    }
  } catch {
    // ignore
  }
}

function wire(): void {
  const bar = document.getElementById('theme-row');
  if (!bar) return;

  const toggle = document.getElementById('theme-toggle');
  function setRowOpen(open: boolean): void {
    bar.classList.toggle('open', open);
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (toggle) {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      setRowOpen(!bar.classList.contains('open'));
    });
  }
  // Close the row when clicking anywhere outside it (and outside the toggle).
  document.addEventListener('click', (e) => {
    if (!bar.classList.contains('open')) return;
    if (bar.contains(e.target) || (toggle && toggle.contains(e.target))) return;
    setRowOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && bar.classList.contains('open')) setRowOpen(false);
  });

  bar.querySelectorAll('.swatch').forEach((sw) => {
    sw.addEventListener('click', () => {
      applyTheme(sw.dataset.theme as string);
      markSwatchActive(sw.dataset.theme as string);
      persistTheme(sw.dataset.theme as string);
      setRowOpen(false);
    });
  });

  const custom = document.getElementById('custom-color') as HTMLInputElement | null;
  if (custom) {
    custom.addEventListener('input', () => {
      root.style.setProperty('--accent', custom.value);
      root.style.setProperty('--accent2', custom.value);
      markSwatchActive(null);
      persistCustom(custom.value);
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wire);
} else {
  wire();
}
