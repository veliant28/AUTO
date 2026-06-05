'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export default function SearchAutocomplete() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: suggestions } = useQuery({
    queryKey: ['autocomplete', query],
    queryFn: async () => {
      if (query.length < 2) return [];
      const { data } = await api.get('/catalog/search/autocomplete', {
        params: { q: query },
      });
      return data;
    },
    enabled: query.length >= 2,
  });

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setIsOpen(false);
      router.push(`/catalog/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const handleSelect = (article: string) => {
    setQuery(article);
    setIsOpen(false);
    router.push(`/catalog/search?q=${encodeURIComponent(article)}`);
  };

  return (
    <div ref={ref} className="relative w-full">
      <form onSubmit={handleSubmit}>
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Поиск по артикулу или названию..."
          className="pl-10 w-full"
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      </form>

      {isOpen && suggestions?.length > 0 && (
        <div className="absolute top-full mt-1 w-full bg-popover border rounded-md shadow-lg z-50 overflow-hidden">
          {suggestions.map((s: any) => (
            <button
              key={s.id}
              onClick={() => handleSelect(s.article)}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors truncate border-b last:border-0"
            >
              <span className="font-mono text-xs text-muted-foreground">{s.article}</span>
              {' — '}
              <span>{s.label.split(' — ').pop()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
