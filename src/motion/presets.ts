import type { Transition, Variants } from 'motion/react';

export const spring = {
  snappy: { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 } satisfies Transition,
  gentle: { type: 'spring', stiffness: 260, damping: 30 } satisfies Transition,
  sheet: { type: 'spring', stiffness: 420, damping: 40, mass: 0.9 } satisfies Transition,
  pop: { type: 'spring', stiffness: 700, damping: 22 } satisfies Transition,
};

export const fade = { duration: 0.18, ease: [0.22, 1, 0.36, 1] } satisfies Transition;

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  enter: { opacity: 1, y: 0, transition: { ...spring.gentle, staggerChildren: 0.035, delayChildren: 0.02 } },
  exit: { opacity: 0, y: -6, transition: fade },
};

export const itemVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  enter: { opacity: 1, y: 0, transition: spring.gentle },
};

export const listItem = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, x: -24, transition: fade },
  transition: spring.snappy,
};
