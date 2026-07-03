'use client'

import { useState, useCallback } from 'react'

/**
 * Hook for managing a checkable list with select-all / delete-selected.
 */
export function useCheckableList(allIds: string[]) {
  const [checked, setChecked] = useState<Set<string>>(new Set())

  const toggle = useCallback((id: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const allChecked = allIds.length > 0 && checked.size === allIds.length

  const toggleAll = useCallback(() => {
    if (allChecked) {
      setChecked(new Set())
    } else {
      setChecked(new Set(allIds))
    }
  }, [allChecked, allIds])

  const clear = useCallback(() => setChecked(new Set()), [])

  return { checked, toggle, allChecked, toggleAll, clear }
}
