'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function RealtimeGroupListener({ groupId }: { groupId: string }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`group-${groupId}-changes`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'expenses' },
        () => router.refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settlements' },
        () => router.refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'expense_splits' },
        () => router.refresh()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [groupId, router])

  return null
}