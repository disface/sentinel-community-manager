import React, { createContext, useContext, useEffect, useState } from 'react';

export interface ThemePreset {
  id: string;
  name: string;
  color: string;
  hover: string;
  subtle: string;
  border: string;
  glow: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'vk-blue',
    name: 'VK Classic (Синий)',
    color: '#2787F5',
    hover: '#1E6DD0',
    subtle: 'rgba(39, 135, 245, 0.15)',
    border: 'rgba(39, 135, 245, 0.4)',
    glow: 'rgba(39, 135, 245, 0.25)',
  },
  {
    id: 'emerald',
    name: 'Изумруд (Зеленый)',
    color: '#10B981',
    hover: '#059669',
    subtle: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.4)',
    glow: 'rgba(16, 185, 129, 0.25)',
  },
  {
    id: 'purple',
    name: 'Неоновый Фиолетовый',
    color: '#8B5CF6',
    hover: '#7C3AED',
    subtle: 'rgba(139, 92, 246, 0.15)',
    border: 'rgba(139, 92, 246, 0.4)',
    glow: 'rgba(139, 92, 246, 0.25)',
  },
  {
    id: 'amber',
    name: 'Янтарь (Теплый золотой)',
    color: '#F59E0B',
    hover: '#D97706',
    subtle: 'rgba(245, 158, 11, 0.15)',
    border: 'rgba(245, 158, 11, 0.4)',
    glow: 'rgba(245, 158, 11, 0.25)',
  },
  {
    id: 'rose',
    name: 'Розовый Закат',
    color: '#F43F5E',
    hover: '#E11D48',
    subtle: 'rgba(244, 63, 94, 0.15)',
    border: 'rgba(244, 63, 94, 0.4)',
    glow: 'rgba(244, 63, 94, 0.25)',
  },
  {
    id: 'cyan',
    name: 'Ледяной Циан',
    color: '#06B6D4',
    hover: '#0891B2',
    subtle: 'rgba(6, 182, 212, 0.15)',
    border: 'rgba(6, 182, 212, 0.4)',
    glow: 'rgba(6, 182, 212, 0.25)',
  },
];

interface ThemeContextType {
  currentTheme: ThemePreset;
  setTheme: (themeId: string) => void;
  presets: ThemePreset[];
}

const ThemeContext = createContext<ThemeContextType>({
  currentTheme: THEME_PRESETS[0],
  setTheme: () => {},
  presets: THEME_PRESETS,
});

export const ThemeProvider: React.FC<{ initialAccent?: string; children: React.ReactNode }> = ({
  initialAccent,
  children,
}) => {
  const [themeId, setThemeId] = useState<string>(initialAccent || 'vk-blue');

  const currentTheme = THEME_PRESETS.find((p) => p.id === themeId) || THEME_PRESETS[0];

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--accent-color', currentTheme.color);
    root.style.setProperty('--accent-hover', currentTheme.hover);
    root.style.setProperty('--accent-subtle', currentTheme.subtle);
    root.style.setProperty('--accent-border', currentTheme.border);
    root.style.setProperty('--accent-glow', currentTheme.glow);
  }, [currentTheme]);

  const setTheme = (id: string) => {
    setThemeId(id);
    if (window.scmAPI) {
      window.scmAPI.saveConfig({ themeAccent: id }).catch(console.error);
    }
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme, presets: THEME_PRESETS }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
