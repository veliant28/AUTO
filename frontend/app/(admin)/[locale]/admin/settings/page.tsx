'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Loader2, Package } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/lib/toast';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const t = useTranslations('admin');
  const queryClient = useQueryClient();
  const [brandName, setBrandName] = React.useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => {
      const { data } = await api.get('/admin/settings');
      return data as { brand_name: string };
    },
    enabled: !!user,
  });

  React.useEffect(() => {
    if (data?.brand_name) setBrandName(data.brand_name);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.put('/admin/settings', { brand_name: brandName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      queryClient.invalidateQueries({ queryKey: ['public-settings'] });
      toast.success(t('settings_saved'));
    },
    onError: () => toast.error(t('save_error')),
  });

  React.useEffect(() => {
    (window as any).__saveSettings = () => saveMutation.mutate();
    return () => { delete (window as any).__saveSettings; };
  }, [saveMutation.mutate]);

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="w-5 h-5" />
            {t('settings_title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('settings_brand_name')}</label>
                  <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="AutoParts" />
                </div>
              </div>

              <div className="rounded-lg bg-muted p-4 border">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">{t('settings_logo_preview') || 'Preview'}</p>
                <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
                  <div className="bg-primary text-primary-foreground p-1 rounded">
                    <Package className="w-6 h-6" />
                  </div>
                  <span>{brandName || 'AutoParts'}</span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
