'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  User, Mail, Phone, Package, Lock, Camera, Send, Pencil, Save,
  CheckCircle, XCircle, Loader2, Eye, EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore } from '@/store/authStore';
import { getAvatarUrl, getInitials } from '@/lib/avatar';
import { useProfile } from '@/hooks/useProfile';
import { PhoneInput, phoneToApi, apiToPhone, formatPhone } from '@/components/ui/PhoneInput';
import { toast } from '@/lib/toast';
import api from '@/lib/api';

const roleBadgeColors: Record<string, string> = {
  admin: 'bg-red-500 text-white',
  manager: 'bg-blue-500 text-white',
  operator: 'bg-orange-500 text-white',
  b2b: 'bg-green-500 text-white',
  retail: 'bg-gray-500 text-white',
};

const deliveryTypes = ['warehouse', 'parcel_locker', 'courier'] as const;

export default function ProfilePage() {
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const tg = useTranslations('telegram');
  const ta = useTranslations('admin');

  const { user, isAuthenticated } = useAuthStore();
  const { profile, isLoading, updateProfile, updating, changePassword, changingPassword } = useProfile();

  const [editing, setEditing] = useState(false);
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [phone, setPhone] = useState('');

  const [deliveryType, setDeliveryType] = useState<string>('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryWarehouse, setDeliveryWarehouse] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');

  const [selectedAvatar, setSelectedAvatar] = useState<number>(profile?.avatar_index || 1);

  const [code, setCode] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState('SVOMBot');
  const [tgConnected, setTgConnected] = useState(false);
  const [tgUsername, setTgUsername] = useState<string | null>(null);
  const [tgLoading, setTgLoading] = useState(false);
  const [tgStatusLoading, setTgStatusLoading] = useState(true);

  useEffect(() => {
    if (profile) {
      setLastName(profile.last_name || '');
      setFirstName(profile.first_name || '');
      setMiddleName(profile.middle_name || '');
      setPhone(apiToPhone(profile.phone));
      setDeliveryType(profile.delivery_type || '');
      setDeliveryCity(profile.delivery_city || '');
      setDeliveryWarehouse(profile.delivery_warehouse || '');
      setSelectedAvatar(profile.avatar_index || 1);
    }
  }, [profile]);

  const checkTelegramStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/telegram/status');
      setTgConnected(data.connected);
      setTgUsername(data.username);
    } catch {
    } finally {
      setTgStatusLoading(false);
    }
  }, []);

  useEffect(() => { if (isAuthenticated) checkTelegramStatus(); }, [isAuthenticated, checkTelegramStatus]);

  const handleConnectTelegram = async () => {
    setTgLoading(true);
    try {
      const { data } = await api.post('/telegram/start');
      setCode(data.code);
      setBotUsername(data.bot_username);
      window.open(`https://t.me/${data.bot_username}?start=${data.code}`, '_blank');
      toast.success(tg('code_sent'));
    } catch {
      toast.error(tg('connect_error'));
    } finally {
      setTgLoading(false);
    }
  };

  const handleDisconnectTelegram = async () => {
    try {
      await api.post('/telegram/disconnect');
      setTgConnected(false);
      setTgUsername(null);
      toast.success(tg('disconnect_success'));
    } catch {
      toast.error(tg('disconnect_error'));
    }
  };

  const handleSaveProfile = () => {
    updateProfile({
      last_name: lastName || null,
      first_name: firstName || null,
      middle_name: middleName || null,
      phone: phone ? phoneToApi(phone) : null,
      delivery_type: deliveryType || null,
      delivery_city: deliveryCity || null,
      delivery_warehouse: deliveryWarehouse || null,
    });
    setEditing(false);
  };

  const handleChangePassword = () => {
    if (!currentPassword || !newPass || !confirmPass) {
      toast.error(tc('required_field'));
      return;
    }
    if (newPass !== confirmPass) {
      toast.error(tc('passwords_mismatch'));
      return;
    }
    if (newPass.length < 6) {
      toast.error(tc('password_min_length', { min: 6 }));
      return;
    }
    changePassword({ current_password: currentPassword, new_password: newPass });
    setCurrentPassword('');
    setNewPass('');
    setConfirmPass('');
  };

  if (!isAuthenticated) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-6">
          <User className="w-16 h-16 mx-auto text-muted-foreground" />
          <h1 className="text-3xl font-bold">{tc('login_title')}</h1>
          <p className="text-muted-foreground">{tc('login_desc')}</p>
          <div className="flex gap-4 justify-center">
            <Link href="/auth/login"><Button>{tc('login')}</Button></Link>
            <Link href="/auth/register"><Button variant="outline">{tc('register')}</Button></Link>
          </div>
        </div>
      </div>
    );
  }

  const name = firstName || profile?.first_name || user?.first_name || tc('user');

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* Column 1: Avatar + Personal Info + Delivery */}
        <div className="space-y-6">

          {/* Avatar header */}
          <Card className="relative">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <Avatar className="w-[120px] h-[120px] ring-4 ring-border shrink-0">
                  <AvatarImage src={getAvatarUrl(profile?.avatar_index)} />
                  <AvatarFallback className="text-3xl">{getInitials(user?.full_name || '', user?.email)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-2xl font-bold">{name}</h1>
                    <div className="flex gap-1 flex-wrap">
                      <Badge className={`${roleBadgeColors[profile?.role || user?.role || 'retail'] || 'bg-gray-500 text-white'} border-0 text-sm`}>
                        {ta(profile?.role || user?.role || 'retail')}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground mt-1">
                    <Mail className="w-4 h-4 shrink-0" />
                    <span className="text-sm truncate">{profile?.email || user?.email}</span>
                  </div>
                  {(profile?.phone) && (
                    <div className="flex items-center gap-2 text-muted-foreground mt-1">
                      <Phone className="w-4 h-4 shrink-0" />
                      <span className="text-sm">{formatPhone(profile.phone)}</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
            <TooltipProvider>
              <div className="absolute bottom-4 right-4 flex gap-2">
                {editing && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="default" size="icon" onClick={handleSaveProfile} disabled={updating}>
                        {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{t('save')}</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" onClick={() => setEditing(!editing)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t('edit')}</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </Card>

          {/* Personal Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="w-5 h-5" /> {t('personal_info')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('last_name')}</label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={!editing} placeholder={t('last_name')} />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('first_name')}</label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={!editing} placeholder={t('first_name')} />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('middle_name')}</label>
                  <Input value={middleName} onChange={(e) => setMiddleName(e.target.value)} disabled={!editing} placeholder={t('middle_name')} />
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">{t('phone')}</label>
                <PhoneInput
                  value={phone}
                  onChange={setPhone}
                  disabled={!editing}
                  placeholder={t('phone_placeholder')}
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </CardContent>
          </Card>

          {/* Delivery */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="w-5 h-5" /> {t('delivery')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">{t('delivery_type')}</label>
                <div className="flex gap-2 flex-wrap">
                  {deliveryTypes.map((dt) => (
                    <button
                      key={dt}
                      onClick={() => editing && setDeliveryType(dt)}
                      disabled={!editing}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                        deliveryType === dt
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:border-primary/50'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {t(`delivery_${dt}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">{t('delivery_city')}</label>
                <Input value={deliveryCity} onChange={(e) => setDeliveryCity(e.target.value)} disabled={!editing} placeholder={t('city_placeholder')} />
              </div>
              {deliveryType !== 'courier' && (
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('delivery_warehouse_number')}</label>
                  <Input value={deliveryWarehouse} onChange={(e) => setDeliveryWarehouse(e.target.value)} disabled={!editing} placeholder="№ 1" />
                </div>
              )}
            </CardContent>
          </Card>

        </div>

        {/* Column 2: Security + Telegram */}
        <div className="space-y-6">

          {/* Security */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Lock className="w-5 h-5" /> {t('security')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">{t('current_password')}</label>
                <div className="relative">
                  <Input type={showCurrent ? 'text' : 'password'} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="pr-10" placeholder={t('current_password')} />
                  <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer">
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">{t('new_password')}</label>
                <div className="relative">
                  <Input type={showNew ? 'text' : 'password'} value={newPass} onChange={(e) => setNewPass(e.target.value)} className="pr-10" placeholder={t('new_password')} />
                  <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer">
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">{tc('confirm_password')}</label>
                <div className="relative">
                  <Input type={showConfirm ? 'text' : 'password'} value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} className="pr-10" placeholder={tc('confirm_password')} />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer">
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button onClick={handleChangePassword} disabled={changingPassword}>
                {changingPassword ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                {t('change_password')}
              </Button>
            </CardContent>
          </Card>

          {/* Telegram */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Send className="w-5 h-5" /> {tg('title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {tgStatusLoading ? (
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
                  <Button variant="outline" size="sm" className="text-destructive" onClick={handleDisconnectTelegram}>
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
                  <p className="text-xs text-muted-foreground">{tg('check_after_send')}</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={checkTelegramStatus}>
                      <Loader2 className="w-3 h-3 mr-1" /> {tg('check')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setCode(null)}>
                      {tc('cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={handleConnectTelegram} disabled={tgLoading}>
                  {tgLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                  {tg('connect')}
                </Button>
              )}
            </CardContent>
          </Card>

        </div>

        {/* Column 3: Avatar Selection */}
        <div className="space-y-6">

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Camera className="w-5 h-5" /> {tc('avatar_style')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: 40 }, (_, i) => i + 1).map((index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setSelectedAvatar(index);
                      updateProfile({ avatar_index: index });
                    }}
                    className={`flex items-center justify-center aspect-square p-1 rounded-lg border transition-colors cursor-pointer overflow-hidden ${
                      (profile?.avatar_index || selectedAvatar) === index
                        ? 'border-primary ring-2 ring-primary/30'
                        : 'hover:border-primary/50'
                    }`}
                  >
                    <Avatar className="w-full h-full">
                      <AvatarImage src={getAvatarUrl(index)} className="w-full h-full object-cover" />
                    </Avatar>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

        </div>

      </div>
    </div>
  );
}
