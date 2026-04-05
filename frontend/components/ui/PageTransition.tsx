'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

const pageVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
  },
};

export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={pageVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* Stagger container — wraps stat cards, feature grids, etc. */
const staggerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const staggerItemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const },
  },
};

interface StaggerContainerProps {
  children: ReactNode;
  className?: string;
}

export function StaggerContainer({ children, className }: StaggerContainerProps) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: StaggerContainerProps) {
  return (
    <motion.div variants={staggerItemVariants} className={className}>
      {children}
    </motion.div>
  );
}

export default PageTransition;
