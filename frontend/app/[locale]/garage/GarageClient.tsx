'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useGarage } from '@/hooks/useGarage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2, Car } from 'lucide-react';
import { toast } from 'sonner';
import { GarageSkeleton } from '@/components/ui/Skeletons';
import PageTransition from '@/components/ui/PageTransition';

export default function GaragePage() {
  const t = useTranslations('common');
  const { garage, isLoading, removeFromGarage, isRemoving } = useGarage();

  if (isLoading) {
    return (
      <PageTransition>
        <div className="container mx-auto py-8 px-4">
          <GarageSkeleton />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="container mx-auto py-8 px-4">
      <div className="flex items-center gap-2 mb-8">
        <Car className="w-6 h-6 text-primary" />
        <h1 className="text-3xl font-bold">{t('garage')}</h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <p className="animate-pulse text-muted-foreground">{t('loading_garage')}</p>
        </div>
      ) : garage.length === 0 ? (
        <div className="bg-muted/30 border-2 border-dashed rounded-xl h-64 flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
          <Car className="w-12 h-12 mb-4 opacity-20" />
          <p className="text-lg font-medium">{t('garage_empty')}</p>
          <p className="text-sm">{t('garage_empty_desc')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {garage.map((vehicle) => (
            <Card key={vehicle.id} className="group hover:border-primary transition-colors">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <Badge variant="outline" className="mb-2">{vehicle.brand_name}</Badge>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      removeFromGarage(vehicle.id);
                      toast.success('Автомобиль удален из гаража');
                    }}
                    disabled={isRemoving}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <CardTitle className="text-xl">{vehicle.model_name}</CardTitle>
                <CardDescription>{vehicle.name}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary">ID: {vehicle.mod_id}</Badge>
                </div>
              </CardContent>
              <CardFooter>
                <Button className="w-full" variant="outline">
                  Подобрать запчасти
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
    </PageTransition>
  );
}
