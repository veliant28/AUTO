'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'

/**
 * Generic searchable select (combobox) with keyboard navigation.
 *
 * - Shows a dropdown of up to 4 visible items with scroll for the rest.
 * - Arrow up/down to navigate, Enter to select, Escape to close.
 * - On selection the input is filled with `getLabel(item)`.
 */
export interface SearchableSelectProps<T> {
  items: T[]
  isLoading: boolean
  /** Currently selected item (can be null). */
  value: T | null
  /** Called when an item is selected. */
  onChange: (item: T) => void
  placeholder?: string
  /** The raw search query bound to the input. */
  searchQuery: string
  /** Called when the user types in the input. */
  onSearchChange: (query: string) => void
  /** Return a stable unique key for each item. */
  getKey: (item: T) => string
  /** Return the label to put into the input when selected. */
  getLabel: (item: T) => string
  /** Custom render for each dropdown item. */
  renderItem: (
    item: T,
    isSelected: boolean,
    isHighlighted: boolean,
  ) => React.ReactNode
  minSearchLength?: number
  noResultsMessage?: string
  typeToSearchMessage?: string
  disabled?: boolean
  /** Max height of the dropdown list in px. Default 160. */
  dropdownMaxHeight?: number
  /** If true, hides the search icon inside the input. */
  hideSearchIcon?: boolean
}

function SearchableSelect<T>({
  items,
  isLoading,
  value,
  onChange,
  placeholder = '',
  searchQuery,
  onSearchChange,
  getKey,
  getLabel,
  renderItem,
  minSearchLength = 2,
  noResultsMessage = 'No results',
  typeToSearchMessage = 'Type to search…',
  disabled = false,
  dropdownMaxHeight = 160,
  hideSearchIcon = false,
}: SearchableSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Reset highlighted index when the result list changes
  useEffect(() => {
    setHighlightedIndex(-1)
  }, [items])

  // Auto-scroll the highlighted item into view
  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return
    const item = listRef.current.querySelector(
      `[data-index="${highlightedIndex}"]`,
    ) as HTMLElement | null
    if (item) {
      item.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex])

  const showDropdown =
    isOpen && searchQuery.length >= minSearchLength && !disabled

  const handleSelect = (item: T) => {
    onChange(item)
    onSearchChange(getLabel(item))
    setIsOpen(false)
    setHighlightedIndex(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown && items.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!showDropdown) {
          setIsOpen(true)
          setHighlightedIndex(0)
        } else {
          setHighlightedIndex((prev) =>
            prev < items.length - 1 ? prev + 1 : 0,
          )
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        if (showDropdown) {
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : items.length - 1,
          )
        }
        break
      case 'Enter':
        e.preventDefault()
        if (
          showDropdown &&
          highlightedIndex >= 0 &&
          highlightedIndex < items.length
        ) {
          handleSelect(items[highlightedIndex])
        }
        break
      case 'Escape':
        setIsOpen(false)
        setHighlightedIndex(-1)
        e.preventDefault()
        break
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        {!hideSearchIcon && (
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
        )}
        <Input
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => {
            onSearchChange(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => {
            if (searchQuery.length >= minSearchLength) setIsOpen(true)
          }}
          onKeyDown={handleKeyDown}
          className={hideSearchIcon ? 'pl-3' : 'pl-8'}
          disabled={disabled}
        />
        {isLoading && (
          <Loader2 className="absolute right-2.5 top-2.5 w-4 h-4 animate-spin text-muted-foreground pointer-events-none" />
        )}
      </div>

      {showDropdown && (
        <div className="absolute top-full mt-1 w-full z-50 bg-popover border rounded-md shadow-lg overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading…</span>
            </div>
          ) : (
            <div
              ref={listRef}
              className="overflow-y-auto py-1"
              style={{ maxHeight: dropdownMaxHeight }}
            >
              {items.length > 0 ? (
                items.map((item, index) => {
                  const isSelected =
                    value != null && getKey(value) === getKey(item)
                  const isHighlighted = index === highlightedIndex
                  return (
                    <div
                      key={getKey(item)}
                      data-index={index}
                      role="option"
                      aria-selected={isSelected || isHighlighted}
                      className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                        isHighlighted
                          ? 'bg-accent'
                          : isSelected
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'hover:bg-muted'
                      }`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                    >
                      {renderItem(item, isSelected, isHighlighted)}
                    </div>
                  )
                })
              ) : (
                <div className="text-sm text-muted-foreground py-3 text-center">
                  {noResultsMessage}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Show type-to-search hint when input is focused but query is too short */}
      {isOpen &&
        !disabled &&
        searchQuery.length < minSearchLength &&
        searchQuery.length > 0 && (
          <div className="absolute top-full mt-1 w-full z-50 bg-popover border rounded-md shadow-lg">
            <div className="text-xs text-muted-foreground py-3 text-center">
              {typeToSearchMessage}
            </div>
          </div>
        )}
    </div>
  )
}

export { SearchableSelect }
