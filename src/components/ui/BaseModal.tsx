import React, { ReactNode, useEffect, useState } from 'react';
import { motion, AnimatePresence, PanInfo } from 'motion/react';
import {
  BACKDROP_VARIANTS,
  BOTTOM_SHEET_VARIANTS,
  MODAL_CONTENT_VARIANTS,
  POPOVER_TRANSITION,
  SHEET_SPRING,
} from '../../utils/motionPresets';

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  mobileSheet?: boolean;
}

export const BaseModal: React.FC<BaseModalProps> = ({
  isOpen,
  onClose,
  children,
  className = '',
  mobileSheet = true,
}) => {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const useSheet = mobileSheet && isMobile;

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 90 || info.velocity.y > 450) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={BACKDROP_VARIANTS}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={POPOVER_TRANSITION}
          className={`fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex ${
            useSheet
              ? 'items-end justify-center p-0'
              : 'items-start justify-center pt-6 sm:pt-10 md:pt-14 pb-8 p-2 sm:p-4 overflow-y-auto'
          }`}
          onClick={onClose}
        >
          <motion.div
            variants={useSheet ? BOTTOM_SHEET_VARIANTS : MODAL_CONTENT_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={SHEET_SPRING}
            drag={useSheet ? 'y' : false}
            dragConstraints={useSheet ? { top: 0 } : undefined}
            dragElastic={useSheet ? { top: 0, bottom: 0.4 } : undefined}
            onDragEnd={useSheet ? handleDragEnd : undefined}
            className={`bg-surface-container-lowest border border-outline-variant w-full flex flex-col shadow-2xl overflow-hidden ${
              useSheet
                ? 'rounded-t-2xl max-h-[92dvh] pb-[env(safe-area-inset-bottom,0px)]'
                : 'rounded-xl max-w-3xl max-h-[92vh]'
            } ${className}`}
            onClick={(e) => e.stopPropagation()}
          >
            {useSheet && (
              <div
                className="w-full flex justify-center pt-2.5 pb-1 shrink-0 touch-none cursor-grab active:cursor-grabbing"
                aria-hidden="true"
              >
                <div className="w-10 h-1 rounded-full bg-outline-variant" />
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
