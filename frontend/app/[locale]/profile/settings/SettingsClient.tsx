'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, User, CheckCircle, XCircle, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useAuthStore } from '@/store/authStore';
import { getAvatarUrl, getInitials } from '@/lib/avatar';
import type { AvatarStyle } from '@/lib/avatar';
import api from '@/lib/api';
import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';

export default function SettingsPage() {
  const { user, isAuthenticated, avatarStyle, setAvatarStyle } = useAuthStore();
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const tg = useTranslations('telegram');
  const av = useTranslations('avatar');

  const avatarStyles: { value: AvatarStyle; label: string }[] = [
    { value: 'initials', label: av('initials') },
    { value: 'identicon', label: av('identicon') },
    { value: 'avataaars', label: av('avataaars') },
    { value: 'bottts', label: av('bottts') },
    { value: 'lorelei', label: av('lorelei') },
    { value: 'thumbs', label: av('thumbs') },
  ];
  const [code, setCode] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState('AutoPartsBot');
  const [tgConnected, setTgConnected] = useState(false);
  const [tgUsername, setTgUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);

  const checkStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/telegram/status');
      setTgConnected(data.connected);
      setTgUsername(data.username);
    } catch {
      // Not authenticated or no connection
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => { if (isAuthenticated) checkStatus(); }, [isAuthenticated, checkStatus]);

  const handleConnect = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/telegram/start');
      setCode(data.code);
      setBotUsername(data.bot_username);

      const tgLink = `https://t.me/${data.bot_username}?start=${data.code}`;
      window.open(tgLink, '_blank');

      toast.success(tg('code_sent'));
    } catch {
      toast.error(tg('connect_error'));
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await api.post('/telegram/disconnect');
      setTgConnected(false);
      setTgUsername(null);
      toast.success(tg('disconnect_success'));
    } catch {
      toast.error(tg('disconnect_error'));
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-20 px-4 max-w-md text-center space-y-6">
        <User className="w-16 h-16 mx-auto text-muted-foreground" />
        <h1 className="text-3xl font-bold">{t('auth_required')}</h1>
        <Link href="/auth/login"><Button>{t('login')}</Button></Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-2xl">
      <Link href="/profile" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> {t('back_to_profile', { default: 'Назад в профиль' })}
      </Link>

      <h1 className="text-3xl font-bold mb-8">{t('settings')}</h1>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{av('title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16">
                <AvatarImage src={getAvatarUrl(user?.full_name || user?.email || 'user', avatarStyle)} />
                <AvatarFallback>{getInitials(user?.full_name || '', user?.email)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{user?.full_name || tc('user')}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <Separator />
            <div>
              <label className="text-sm font-medium mb-2 block">{av('style')}</label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {avatarStyles.map((style) => (
                  <button
                    key={style.value}
                    onClick={() => setAvatarStyle(style.value)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors ${
                      avatarStyle === style.value
                        ? 'border-primary bg-primary/10'
                        : 'hover:border-primary/50'
                    }`}
                  >
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={getAvatarUrl(user?.full_name || user?.email || 'user', style.value)} />
                      <AvatarFallback>{getInitials(user?.full_name || '', user?.email)}</AvatarFallback>
                    </Avatar>
                    <span className="text-[10px] text-muted-foreground">{style.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{tg('title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {tg('desc')}
            </p>

            {statusLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> {tg('checking')}
              </div>
            ) : tgConnected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="font-medium">{tg('connected')}</span>
                  {tgUsername && <Badge variant="outline">@{tgUsername}</Badge>}
                </div>
                  <Button variant="outline" size="sm" className="text-destructive" onClick={handleDisconnect}>
                  <XCircle className="w-4 h-4 mr-1" /> {tg('disconnect')}
                </Button>
              </div>
            ) : code ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Send className="w-4 h-4 text-primary" />
                  <span>{tg('send_code')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input value={code} readOnly className="w-32 font-mono text-lg text-center" />
                  <span className="text-sm text-muted-foreground">→ @{botUsername}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {tg('check_after_send', { default: 'После отправки кода подождите несколько секунд и нажмите «Проверить»' })}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={checkStatus}>
                    <Loader2 className="w-3 h-3 mr-1" /> {tg('check')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCode(null)}>
                    {tg('cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button onClick={handleConnect} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                {tg('connect')}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
