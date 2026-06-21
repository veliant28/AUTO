'use client'

import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

export default function AdminErrorPage({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div className="container mx-auto py-20 px-4 flex flex-col items-center justify-center text-center space-y-6 min-h-[60vh]">
      <div className="bg-destructive/10 rounded-full p-6">
        <AlertTriangle className="w-16 h-16 text-destructive" />
      </div>
      <h1 className="text-2xl font-bold">Admin Panel</h1>
      <p className="text-muted-foreground max-w-md">
        Произошла ошибка. Пожалуйста, попробуйте снова.
      </p>
      <div className="flex gap-4">
        <Button size="lg" onClick={() => reset()}>
          Попробовать снова
        </Button>
        <Link href="/">
          <Button variant="outline" size="lg">
            На главную
          </Button>
        </Link>
      </div>
    </div>
  )
}
