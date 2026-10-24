'use client'

import React from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'

/** Сколько держим бейдж погашенным при смене содержимого */
const EXIT_MS = 180

/**
 * Бейджи, которые уже появлялись только что. Повторный маунт того же бейджа
 * (первая загрузка страницы перерисовывает таблицу) не проигрывает анимацию
 * заново — иначе бейджи заметно «дёргаются».
 */
const recentlyAnimated = new Map<string, number>()
const REPLAY_WINDOW_MS = 1500
const REGISTRY_LIMIT = 300

/** Текстовое содержимое бейджа — он же ключ «того же самого» бейджа */
function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (React.isValidElement(node)) {
    return textOf((node.props as { children?: React.ReactNode }).children)
  }
  return ''
}

type AnimatedBadgeProps = HTMLMotionProps<'span'> & {
  /**
   * Идентификатор содержимого бейджа. Когда он меняется (смена статуса,
   * просрочка, переход «Осталось …» → дата), бейдж плавно гаснет, меняет
   * содержимое и появляется заново — без перезагрузки страницы.
   */
  swapKey?: string | number | null
  /**
   * Уникальный стабильный ключ бейджа для дедупликации входной анимации.
   * Нужен, когда на странице несколько бейджей с одинаковым текстом
   * (например, роли в таблице): без него второй такой бейдж пропустит
   * анимацию появления.
   */
  animationKey?: string | number
}

/**
 * Обёртка бейджа: появление (всплытие с масштабом) и исчезание при смене
 * содержимого — те же анимации, что у бейджей статусов в журнале заявок.
 */
export default function AnimatedBadge({
  children,
  className,
  swapKey,
  animationKey,
  ...props
}: AnimatedBadgeProps) {
  const id =
    animationKey != null
      ? String(animationKey)
      : textOf(children as React.ReactNode)
  const skip = React.useMemo(() => {
    if (!id) return false
    const last = recentlyAnimated.get(id)
    return last != null && performance.now() - last < REPLAY_WINDOW_MS
  }, [id])

  // С содержимым без swapKey работаем напрямую, со swapKey — через «гашение»
  const [displayed, setDisplayed] = React.useState(children)
  const [hidden, setHidden] = React.useState(false)
  const keyRef = React.useRef(swapKey)
  // Ключ, которому соответствует отображаемое сейчас содержимое
  const displayedKeyRef = React.useRef(swapKey)
  const childrenRef = React.useRef(children)
  childrenRef.current = children

  // Смена идентификатора: гасим старое содержимое, подменяем, показываем новое
  React.useEffect(() => {
    if (swapKey === undefined) return
    if (swapKey === keyRef.current) return
    keyRef.current = swapKey
    setHidden(true)
    const timer = setTimeout(() => {
      displayedKeyRef.current = swapKey
      setDisplayed(childrenRef.current)
      setHidden(false)
    }, EXIT_MS)
    return () => clearTimeout(timer)
  }, [swapKey])

  // Тот же бейдж с обновлённым текстом (например, минуты) — без анимации;
  // пока идёт смена идентификатора, содержимое не трогаем
  React.useEffect(() => {
    if (swapKey === undefined || hidden) return
    if (swapKey !== displayedKeyRef.current) return
    const next = childrenRef.current as React.ReactNode
    if (textOf(next) === textOf(displayed as React.ReactNode)) return
    setDisplayed(next)
  }, [children, displayed, hidden, swapKey])

  // Отметку ставим только при монтировании — повторные рендеры её не обновляют
  const skipRef = React.useRef(skip)
  React.useEffect(() => {
    if (skipRef.current || !id) return
    queueMicrotask(() => {
      if (recentlyAnimated.size > REGISTRY_LIMIT) {
        const cutoff = performance.now() - REPLAY_WINDOW_MS
        for (const [key, at] of recentlyAnimated) {
          if (at < cutoff) recentlyAnimated.delete(key)
        }
      }
      recentlyAnimated.set(id, performance.now())
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.span
      initial={skip ? false : { opacity: 0, scale: 0.8 }}
      animate={hidden ? { opacity: 0, scale: 0.8 } : { opacity: 1, scale: 1 }}
      transition={{ duration: hidden ? EXIT_MS / 1000 : 0.35, ease: 'easeOut' }}
      className={`inline-flex ${className ?? ''}`}
      {...props}
    >
      {swapKey === undefined ? children : displayed}
    </motion.span>
  )
}
