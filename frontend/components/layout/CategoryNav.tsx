'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { Wrench, ArrowUpDown, CircleStop, Thermometer, Fuel, Settings, Lightbulb, Car, FlaskConical } from 'lucide-react';
import api from '@/lib/api';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Подвеска и Рулевое': <ArrowUpDown className="w-5 h-5" />,
  'Тормозная система': <CircleStop className="w-5 h-5" />,
  'Охлаждение и Отопление': <Thermometer className="w-5 h-5" />,
  'Двигатель и Выхлоп': <Fuel className="w-5 h-5" />,
  'Сцепление и трансмиссия': <Settings className="w-5 h-5" />,
  'Электрика и Освещение': <Lightbulb className="w-5 h-5" />,
  'Детали кузова': <Car className="w-5 h-5" />,
  'Автохимия и аксессуары': <FlaskConical className="w-5 h-5" />,
};

interface ChildCat {
  id: number;
  name: string;
  name_ru: string;
  product_count: number;
}

interface Group {
  name: string;
  name_ru: string;
  children: ChildCat[];
}

interface HeaderCat {
  id: number;
  name: string;
  name_ru: string;
  groups: Group[];
}

interface TosLink {
  id: number;
  name: string;
  product_count: number;
}

interface TosSection {
  heading: string;
  links: TosLink[];
}

const OFFSET = 8;

export default function CategoryNav() {
  const [active, setActive] = useState<number | null>(null);
  const [popupTop, setPopupTop] = useState<number | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeRef = useRef<number | null>(null);

  const locale = useLocale();
  const t = useTranslations('header');

  const { data } = useQuery({
    queryKey: ['categories-header', locale],
    queryFn: async () => {
      const { data } = await api.get(`/categories/header?locale=${locale}`);
      return data as { categories: HeaderCat[]; zapchasti_dlya_to: TosSection[] | null };
    },
    staleTime: 300_000,
  });

  const categories = data?.categories || [];
  const toSections = data?.zapchasti_dlya_to || [];

  const positionPopup = useCallback(() => {
    const header = navRef.current?.closest('header');
    if (!header) return;
    const headerRect = header.getBoundingClientRect();
    setPopupTop(headerRect.bottom + 4);
  }, []);

  const handleMouseEnter = (idx: number) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    activeRef.current = idx;
    setActive(idx);
    positionPopup();
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setActive(null);
      setPopupTop(null);
    }, 150);
  };

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  useEffect(() => {
    if (active === null) return;
    const onResize = () => positionPopup();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [active, positionPopup]);

  const activeIdx = active !== null && active < categories.length + (toSections.length > 0 ? 1 : 0) ? active : null;

  let activePopup: React.ReactNode = null;
  if (activeIdx !== null) {
    if (activeIdx < categories.length) {
      const cat = categories[activeIdx];
      const groups = cat.groups
        .map(g => ({
          ...g,
          children: g.children.filter(c => c.product_count > 0),
        }))
        .filter(g => g.children.length > 0);

      if (groups.length > 0) {
        activePopup = (
          <div className="flex gap-8">
            {groups.map((group) => (
              <div key={group.name} className="min-w-[150px]">
                <p className="text-sm font-semibold text-muted-foreground mb-2">
                  {group.name}
                </p>
                <div className="space-y-0.5">
                  {group.children.map((child) => (
                    <Link
                      key={child.id}
                      href={`/catalog?categoryId=${child.id}`}
                      className="block text-sm text-foreground/80 hover:text-primary hover:bg-muted rounded px-1.5 -mx-1.5 py-1 transition-colors leading-snug"
                      onClick={() => setActive(null)}
                    >
                      {child.name}
                      {child.product_count > 0 && (
                        <span className="text-xs text-muted-foreground ml-1">({child.product_count})</span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      }
    } else {
      const filteredSections = toSections
        .map(s => ({
          ...s,
          links: s.links.filter(l => l.product_count > 0),
        }))
        .filter(s => s.links.length > 0);

      if (filteredSections.length > 0) {
        activePopup = (
          <div className="flex gap-8">
            {filteredSections.map((section) => (
              <div key={section.heading} className="min-w-[150px]">
                <p className="text-sm font-semibold text-muted-foreground mb-2">
                  {section.heading}
                </p>
                <div className="space-y-0.5">
                  {section.links.map((link) => (
                    <Link
                      key={link.id}
                      href={`/catalog?categoryId=${link.id}`}
                      className="block text-sm text-foreground/80 hover:text-primary hover:bg-muted rounded px-1.5 -mx-1.5 py-1 transition-colors leading-snug"
                      onClick={() => setActive(null)}
                    >
                      {link.name}
                      {link.product_count > 0 && (
                        <span className="text-xs text-muted-foreground ml-1">({link.product_count})</span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      }
    }
  }

  return (
    <div ref={navRef} className="hidden lg:flex flex-1 mx-4 h-full items-center justify-around gap-1" onMouseLeave={handleMouseLeave}>
      {categories.map((cat, idx) => (
        <button
          key={cat.id}
          ref={el => { btnRefs.current[idx] = el; }}
          onMouseEnter={() => handleMouseEnter(idx)}
          className={`flex items-center gap-1.5 h-10 text-sm font-medium text-foreground/80 hover:text-primary transition-colors px-1 cursor-pointer ${activeIdx === idx ? 'text-primary' : ''}`}
        >
          <span className="w-5 h-5 shrink-0 flex items-center justify-center">
            {CATEGORY_ICONS[cat.name_ru]}
          </span>
          <span className="leading-tight line-clamp-2">{cat.name}</span>
        </button>
      ))}

      {toSections.length > 0 && (
        <button
          ref={el => { btnRefs.current[categories.length] = el; }}
          onMouseEnter={() => handleMouseEnter(categories.length)}
          className={`flex items-center gap-1.5 h-10 text-sm font-medium text-foreground/80 hover:text-primary transition-colors px-1 cursor-pointer ${activeIdx === categories.length ? 'text-primary' : ''}`}
        >
          <span className="w-5 h-5 shrink-0 flex items-center justify-center">
            <Wrench className="w-5 h-5" />
          </span>
          <span className="leading-tight line-clamp-2">{t('maintenance_parts')}</span>
        </button>
      )}

      {activePopup && popupTop !== null && (
        <div
          onMouseEnter={() => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }}
          onMouseLeave={handleMouseLeave}
          className="fixed z-50 left-0 right-0 bg-popover border-b rounded-b-lg shadow-xl py-6 max-h-[70vh] overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150"
          style={{ top: popupTop }}
        >
          <div className="container mx-auto px-4">
            {activePopup}
          </div>
        </div>
      )}
    </div>
  );
}
