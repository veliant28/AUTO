'use client'

import { Clock } from 'lucide-react'
import type { WaybillTrackingEvent } from '@/lib/types/nova-poshta'

export default function WaybillTrackingTimeline({
  t,
  events,
}: {
  t: (key: string) => string
  events: WaybillTrackingEvent[]
}) {
  if (events.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
        {t('novaposhta_tracking_empty')}
      </div>
    )
  }

  return (
    <div className="relative pl-12 space-y-0">
      <div className="absolute left-[22px] top-2 bottom-2 w-[3px] bg-border" />
      {events.map((event, index) => {
        const isFirst = index === 0
        return (
          <div key={index} className="relative pb-6">
            <div
              className={`absolute -left-[34px] top-1.5 w-5 h-5 rounded-full border-[3px] border-background ${
                isFirst ? 'bg-green-500' : 'bg-blue-500'
              }`}
            />
            <div className="mb-1">
              <div className="font-medium">
                {t(`novaposhta_status_${event.status_code}`) ||
                  event.status_text ||
                  `Код ${event.status_code}`}
              </div>
              {event.event_at && (
                <div className="text-sm text-muted-foreground">
                  {new Date(event.event_at).toLocaleString()}
                </div>
              )}
            </div>
            {event.location && (
              <p className="text-muted-foreground pl-1 text-sm">
                {event.location}
                {event.warehouse ? ` — ${event.warehouse}` : ''}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
