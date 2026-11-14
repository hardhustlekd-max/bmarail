import type { Transition } from 'motion/react';

/**
 * Unified Motion & Tactile Spring Presets
 * Target latency budget: 120-180ms crisp tactile feedback.
 * Compositor-only properties (transform, opacity) enforced across all presets.
 */

export const TACTILE_SPRING: Transition = {
  type: 'spring',
  stiffness: 520,
  damping: 34,
  mass: 0.7,
};

export const SHEET_SPRING: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 36,
  mass: 0.85,
};

export const TAB_INDICATOR_SPRING: Transition = {
  type: 'spring',
  stiffness: 500,
  damping: 38,
  mass: 0.75,
};

export const POPOVER_TRANSITION: Transition = {
  duration: 0.15,
  ease: [0.16, 1, 0.3, 1],
};

export const ROUTE_TRANSITION: Transition = {
  duration: 0.16,
  ease: [0.16, 1, 0.3, 1],
};

export const STEP_TRANSITION: Transition = {
  duration: 0.18,
  ease: [0.16, 1, 0.3, 1],
};

export const TAP_SCALE = { scale: 0.97 } as const;
export const SUBTLE_TAP_SCALE = { scale: 0.985 } as const;

export const MODAL_CONTENT_VARIANTS = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: 6 },
};

export const BOTTOM_SHEET_VARIANTS = {
  hidden: { opacity: 0, y: '100%' },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: '100%' },
};

export const BACKDROP_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};
