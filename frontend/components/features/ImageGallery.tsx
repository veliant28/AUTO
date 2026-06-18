'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface ImageGalleryProps {
  images: { url?: string; name?: string }[];
  article: string;
}

export default function ImageGallery({ images, article }: ImageGalleryProps) {
  const t = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const validImages = images.filter((img) => img.url || img.name);

  if (validImages.length === 0) {
    return (
      <div className="aspect-square rounded-md bg-muted flex items-center justify-center">
        <p className="text-sm text-muted-foreground">{t('no_images')}</p>
      </div>
    );
  }

  const imgUrl = (img: { url?: string; name?: string }) =>
    img.url || `https://auto-db.pro/images/${img.name}`;

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {validImages.map((img, idx) => (
          <button
            key={idx}
            onClick={() => { setCurrentIndex(idx); setOpen(true); }}
            className="aspect-square rounded-md overflow-hidden border bg-muted relative hover:ring-2 ring-primary transition-all"
          >
            <Image
              src={imgUrl(img)}
              alt={`${article} - ${idx + 1}`}
              fill
              className="object-contain p-2"
              sizes="(max-width: 640px) 33vw, 200px"
              unoptimized
            />
          </button>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl w-[95vw] h-[80vh] p-0 bg-black/95 border-none" aria-describedby={undefined}>
          <DialogTitle className="sr-only">{t('image_gallery')}</DialogTitle>
          <DialogClose className="absolute top-4 right-4 z-50">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
              <X className="w-5 h-5" />
            </Button>
          </DialogClose>

          {validImages.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-4 top-1/2 -translate-y-1/2 z-50 text-white hover:bg-white/20 h-12 w-12"
                onClick={() => setCurrentIndex((prev) => (prev === 0 ? validImages.length - 1 : prev - 1))}
              >
                <ChevronLeft className="w-8 h-8" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 top-1/2 -translate-y-1/2 z-50 text-white hover:bg-white/20 h-12 w-12"
                onClick={() => setCurrentIndex((prev) => (prev === validImages.length - 1 ? 0 : prev + 1))}
              >
                <ChevronRight className="w-8 h-8" />
              </Button>
            </>
          )}

          <div className="relative w-full h-full flex items-center justify-center p-8">
            <Image
              src={imgUrl(validImages[currentIndex])}
              alt={`${article} - ${currentIndex + 1}`}
              fill
              className="object-contain"
              sizes="95vw"
              unoptimized
              priority
            />
          </div>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 rounded-full px-4 py-2">
            {validImages.map((_, idx) => (
              <button
                key={idx}
                className={`w-2 h-2 rounded-full transition-all ${
                  idx === currentIndex ? 'bg-white scale-125' : 'bg-white/40'
                }`}
                onClick={() => setCurrentIndex(idx)}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
