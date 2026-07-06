'use client'

import { motion } from 'framer-motion'

export default function TypingIndicator({ name }: { name?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
      <div className="flex items-center gap-1">
        <motion.span
          className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
        />
        <motion.span
          className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
        />
        <motion.span
          className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
        />
      </div>
      {name && <span>{name} печатает...</span>}
      {!name && <span>печатает...</span>}
    </div>
  )
}
