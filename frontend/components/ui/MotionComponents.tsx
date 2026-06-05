'use client';

import { motion } from 'framer-motion';
import { forwardRef } from 'react';
import { Button as ShadcnButton, ButtonProps } from '@/components/ui/button';

export const MotionButton = motion(ShadcnButton);

export const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, duration: 0.2 },
  }),
};

export const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04 },
  },
};

export const fadeInUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};
