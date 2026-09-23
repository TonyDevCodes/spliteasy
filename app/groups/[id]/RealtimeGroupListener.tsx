'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { subscribeToTableChanges, uniqueChannelName } from '@/lib/realtime'

const WATCHED_TABLES = ['expenses', 'settlements', 'expense_splits', 'groups']

export default function RealtimeGroupListener({ groupId }: { groupId: string }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    const channel = subscribeToTableChanges(
      supabase,
      uniqueChannelName(`group-${groupId}-changes`),
      WATCHED_TABLES,
      () => router.refresh()
    )

    return () => {
      supabase.removeChannel(channel)
    }
  }, [groupId, router])

  return null
}