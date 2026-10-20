import { motion, useReducedMotion } from 'motion/react';

/** The RUMBAI assistant orb. Animates only while `active`, so idle screens cost nothing. */
export function Orb({ active = false, size = 44, tone = 'accent' }: { active?: boolean; size?: number; tone?: 'accent' | 'local' | 'cloud' | 'muted' }) {
  const reduce = useReducedMotion();
  const animate = active && !reduce;
  return (
    <motion.span
      className={`orb orb-${tone}`}
      style={{ width: size, height: size }}
      aria-hidden
      animate={animate ? { scale: [1, 1.08, 1], rotate: [0, 120, 240, 360] } : { scale: 1, rotate: 0 }}
      transition={animate ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
    >
      <span className="orb-core" />
    </motion.span>
  );
}
