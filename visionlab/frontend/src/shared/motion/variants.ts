import type { Variants, Transition } from 'framer-motion'

const spring: Transition = { type: 'spring', stiffness: 400, damping: 30 }
const smooth: Transition = { duration: 0.45, ease: [0.16, 1, 0.3, 1] }

export const fadeIn: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: smooth },
}

export const fadeInUp: Variants = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: smooth },
}

export const fadeInDown: Variants = {
  hidden:  { opacity: 0, y: -16 },
  visible: { opacity: 1, y: 0,   transition: smooth },
}

export const scaleIn: Variants = {
  hidden:  { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1,    transition: spring },
}

export const slideInLeft: Variants = {
  hidden:  { opacity: 0, x: -24 },
  visible: { opacity: 1, x: 0,   transition: smooth },
}

export const slideInRight: Variants = {
  hidden:  { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0,  transition: smooth },
}

export const stagger = (staggerChildren = 0.08, delayChildren = 0): Variants => ({
  hidden:  {},
  visible: { transition: { staggerChildren, delayChildren } },
})

export const hoverLift = {
  whileHover: { y: -3, transition: spring },
  whileTap:   { scale: 0.97, transition: spring },
}

export const hoverGlow = {
  whileHover: { scale: 1.03, transition: spring },
  whileTap:   { scale: 0.97, transition: spring },
}

export const glowPulse: Variants = {
  animate: {
    opacity: [0.4, 1, 0.4],
    transition: { duration: 3.5, ease: 'easeInOut', repeat: Infinity },
  },
}

export const breathe: Variants = {
  animate: {
    scale:   [1, 1.06, 1],
    opacity: [0.55, 1, 0.55],
    transition: { duration: 4, ease: 'easeInOut', repeat: Infinity },
  },
}

export const typewriter = (characters: number, speed = 0.04): Variants => ({
  hidden:  { width: 0 },
  visible: {
    width: 'auto',
    transition: { duration: characters * speed, ease: 'linear' },
  },
})

export const shimmerVariant: Variants = {
  animate: {
    backgroundPosition: ['−400px center', '400px center'],
    transition: { duration: 2.5, ease: 'linear', repeat: Infinity },
  },
}
