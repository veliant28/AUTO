'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const THEMES = ['light', 'dark', 'system'] as const;
const THEME_ICONS: Record<string, React.ReactNode> = {
  light: <Sun className="h-5 w-5" />,
  dark: <Moon className="h-5 w-5" />,
  system: <Monitor className="h-5 w-5" />,
};

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const cycle = () => {
    const idx = THEMES.indexOf(theme as typeof THEMES[number]);
    setTheme(THEMES[(idx + 1) % THEMES.length]);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={cycle}>
          {THEME_ICONS[theme || 'system']}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System'}
      </TooltipContent>
    </Tooltip>
  );
}
