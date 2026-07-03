'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Save, Plug, Copy, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/lib/toast'
import { toast as sonnerToast } from 'sonner'
import api from '@/lib/api'

export default function SettingsTab({ t }: { t: (k: string) => string }) {
  const queryClient = useQueryClient()
  const [apiUrl, setApiUrl] = useState('')
  const [dbHost, setDbHost] = useState('')
  const [dbName, setDbName] = useState('')
  const [dbUser, setDbUser] = useState('')
  const [dbPass, setDbPass] = useState('')
  const [dbHasPass, setDbHasPass] = useState(false)
  const [dbPassLen, setDbPassLen] = useState(0)

  const { data } = useQuery({
    queryKey: ['tecdoc-settings'],
    queryFn: async () => {
      const { data } = await api.get('/admin/tecdoc/settings')
      return data
    },
  })

  useEffect(() => {
    if (data) {
      setApiUrl(data.api_url || '')
      setDbHost(data.db_host || '')
      setDbName(data.db_name || '')
      setDbUser(data.db_user || '')
      setDbPass('')
      setDbHasPass(data.db_has_pass || false)
      setDbPassLen(data.db_pass_length || 0)
    }
  }, [data])

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success(t('copied') || 'Copied')
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        api_url: apiUrl,
        db_host: dbHost,
        db_name: dbName,
        db_user: dbUser,
      }
      if (dbPass) payload.db_pass = dbPass
      await api.put('/admin/tecdoc/settings', payload)
    },
    onSuccess: () => {
      toast.success(t('tecdoc_settings_saved'))
      queryClient.invalidateQueries({ queryKey: ['tecdoc-settings'] })
    },
    onError: () => toast.error(t('save_error')),
  })

  const testMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/admin/tecdoc/settings/test')
      return data
    },
    onSuccess: (res) => {
      if (res.success) {
        toast.success(
          `${t('tecdoc_test_ok')}${res.latency_ms ? ` (${res.latency_ms}ms)` : ''}`,
        )
      } else if (
        res.message?.includes('403') ||
        res.message?.includes('Forbidden')
      ) {
        toast.error(t('tecdoc_test_403'))
      } else {
        toast.error(t('tecdoc_test_fail'))
      }
    },
    onError: () => toast.error(t('tecdoc_test_fail')),
  })

  const Field = ({
    label,
    value,
    onChange,
    type = 'text',
    passLen,
  }: {
    label: string
    value: string
    onChange: (v: string) => void
    type?: string
    passLen?: number
  }) => (
    <div>
      <label className="text-sm text-muted-foreground mb-1 block">
        {label}
      </label>
      <div className="relative">
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={passLen ? '•'.repeat(passLen) : undefined}
          className="pr-9"
        />
        {value && (
          <button
            type="button"
            onClick={() => copyToClipboard(value)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            title={t('copy') || 'Copy'}
          >
            <Copy className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )

  return (
    <Card className="max-w-md">
      <CardContent className="space-y-4 pt-6">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {t('tecdoc_api_title')}
        </p>
        <Field
          label={t('tecdoc_settings_url')}
          value={apiUrl}
          onChange={setApiUrl}
        />

        <hr />
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {t('tecdoc_settings_db_title')}
        </p>
        <Field
          label={t('tecdoc_settings_db_host')}
          value={dbHost}
          onChange={setDbHost}
        />
        <Field
          label={t('tecdoc_settings_db_name')}
          value={dbName}
          onChange={setDbName}
        />
        <Field
          label={t('tecdoc_settings_db_user')}
          value={dbUser}
          onChange={setDbUser}
        />
        <Field
          label={t('tecdoc_settings_db_pass')}
          value={dbPass}
          onChange={setDbPass}
          type="password"
          passLen={dbPassLen}
        />

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className="gap-2"
          >
            {testMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plug className="w-4 h-4" />
            )}
            {t('tecdoc_settings_test')}
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="gap-2"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {t('tecdoc_settings_save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
