'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Globe } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const languages = [
  { code: 'ru', label: 'Русский', short: 'RU' },
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'ua', label: 'Українська', short: 'UA' },
];

export default function LanguageSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const tc = useTranslations('common');

  const current = languages.find((l) => l.code === locale) || languages[0];

  const switchLanguage = (code: string) => {
    const segments = pathname.split('/').filter(Boolean);
    if (['ru', 'en', 'ua'].includes(segments[0])) {
      segments[0] = code;
    }
    router.replace('/' + segments.join('/'));
  };

  return (
    <Tooltip>
      <DropdownMenu>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 px-2">
              <Globe className="h-4 w-4" />
              <span className="font-medium text-xs">{current.short}</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <DropdownMenuContent align="end">
          {languages.map((lang) => (
            <DropdownMenuItem 
              key={lang.code} 
              onClick={() => switchLanguage(lang.code)}
              className={locale === lang.code ? 'bg-accent font-medium' : ''}
            >
              <span className="text-xs mr-2">{lang.code === 'ru' ? '🇷🇺' : lang.code === 'en' ? '🇬🇧' : '🇺🇦'}</span>
              {lang.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <TooltipContent>{tc('language')}</TooltipContent>
    </Tooltip>
  );
}
