import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import i18n from '@/i18n';
import { useAnimations } from '@/components/animation-context';
import type { ModalOriginRect } from '@/store/gameStore';

type ModalAnimationMode = 'default' | 'card-zoom';
type ModalSize = 'default' | 'wide';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    children: ReactNode;
    ariaLabel?: string;
    ariaLabelledBy?: string;
    animationMode?: ModalAnimationMode;
    originRect?: ModalOriginRect | null;
    onExitComplete?: () => void;
    size?: ModalSize;
}

const modalEase = [0.4, 0, 0.2, 1] as const;
const modalExitEase = [0.4, 0, 1, 1] as const;

const modalSizeConfig: Record<ModalSize, { className: string; maxWidthPx: number }> = {
    default: { className: 'max-w-4xl', maxWidthPx: 896 },
    wide: { className: 'max-w-6xl', maxWidthPx: 1152 },
};

function getEstimatedTargetRect(maxWidthPx: number) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(viewportWidth - 32, maxWidthPx);
    const height = Math.min(viewportHeight * 0.9, viewportHeight - 32);

    return {
        top: (viewportHeight - height) / 2,
        left: (viewportWidth - width) / 2,
        width,
        height,
    };
}

function getCardZoomTransform(originRect: ModalOriginRect, maxWidthPx: number) {
    const targetRect = getEstimatedTargetRect(maxWidthPx);

    return {
        x: originRect.left - targetRect.left,
        y: originRect.top - targetRect.top,
        scaleX: originRect.width / targetRect.width,
        scaleY: originRect.height / targetRect.height,
    };
}

export function Modal({
    isOpen,
    onClose,
    children,
    ariaLabel,
    ariaLabelledBy,
    animationMode = 'default',
    originRect = null,
    onExitComplete,
    size = 'default',
}: ModalProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const { animationsEnabled } = useAnimations();
    const [shouldRender, setShouldRender] = useState(isOpen);
    const shouldUseCardZoom = animationsEnabled && animationMode === 'card-zoom' && Boolean(originRect);
    const sizeConfig = modalSizeConfig[size];

    const zoomTransform = useMemo(
        () => shouldUseCardZoom && originRect ? getCardZoomTransform(originRect, sizeConfig.maxWidthPx) : null,
        [originRect, shouldUseCardZoom, sizeConfig.maxWidthPx]
    );

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        setShouldRender(true);

        const previousOverflow = document.body.style.overflow;
        const activeElement = document.activeElement;
        previousFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
        document.body.style.overflow = 'hidden';

        const getFocusableElements = () => {
            if (!dialogRef.current) {
                return [] as HTMLElement[];
            }

            const selector = [
                'a[href]',
                'button:not([disabled])',
                'textarea:not([disabled])',
                'input:not([disabled])',
                'select:not([disabled])',
                '[tabindex]:not([tabindex="-1"])',
            ].join(', ');

            return Array.from(dialogRef.current.querySelectorAll<HTMLElement>(selector));
        };

        const focusInitialElement = () => {
            const focusable = getFocusableElements();
            const firstElement = focusable[0] ?? dialogRef.current;
            firstElement?.focus();
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
                return;
            }

            if (event.key !== 'Tab') {
                return;
            }

            const focusable = getFocusableElements();
            if (focusable.length === 0) {
                event.preventDefault();
                dialogRef.current?.focus();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        const frame = window.requestAnimationFrame(focusInitialElement);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            window.cancelAnimationFrame(frame);
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
            previousFocusRef.current?.focus();
        };
    }, [isOpen, onClose]);

    const handleExitComplete = () => {
        setShouldRender(false);
        onExitComplete?.();
    };

    if (typeof document === 'undefined' || !shouldRender) {
        return null;
    }

    const modalContent = (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <AnimatePresence onExitComplete={handleExitComplete}>
                {isOpen ? (
                    <>
                        <motion.div
                            className="absolute inset-0 bg-black/80"
                            onClick={onClose}
                            aria-hidden="true"
                            style={{ backdropFilter: 'blur(8px)' }}
                            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                            animate={{ opacity: 1, backdropFilter: 'blur(8px)' }}
                            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                            transition={{ duration: 0.2, ease: modalEase }}
                        />

                        <motion.div
                            role="dialog"
                            aria-modal="true"
                            aria-label={ariaLabelledBy ? undefined : (ariaLabel ?? i18n.t('common.dialog'))}
                            aria-labelledby={ariaLabelledBy}
                            tabIndex={-1}
                            ref={dialogRef}
                            className={`relative z-10 w-full ${sizeConfig.className} max-h-[90vh] overflow-hidden`}
                            style={{ transformOrigin: 'top left' }}
                            initial={zoomTransform
                                ? {
                                    opacity: 0.85,
                                    x: zoomTransform.x,
                                    y: zoomTransform.y,
                                    scaleX: zoomTransform.scaleX,
                                    scaleY: zoomTransform.scaleY,
                                }
                                : { opacity: animationsEnabled ? 0 : 1, scale: animationsEnabled ? 0.96 : 1, y: animationsEnabled ? 12 : 0 }}
                            animate={{ opacity: 1, x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1 }}
                            exit={zoomTransform
                                ? {
                                    opacity: 0.85,
                                    x: zoomTransform.x,
                                    y: zoomTransform.y,
                                    scaleX: zoomTransform.scaleX,
                                    scaleY: zoomTransform.scaleY,
                                    transition: { duration: 0.22, ease: modalExitEase },
                                }
                                : {
                                    opacity: animationsEnabled ? 0 : 1,
                                    scale: animationsEnabled ? 0.98 : 1,
                                    y: animationsEnabled ? 10 : 0,
                                    transition: { duration: animationsEnabled ? 0.12 : 0, ease: modalExitEase },
                                }}
                            transition={zoomTransform
                                ? { duration: 0.34, ease: modalEase }
                                : { duration: animationsEnabled ? 0.18 : 0, ease: modalEase }}
                        >
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label={i18n.t('common.close')}
                                className="absolute top-4 right-4 z-20 p-2 rounded-full bg-stone-800/80 text-stone-400 hover:text-white"
                            >
                                <X className="h-5 w-5" />
                            </button>

                            {children}
                        </motion.div>
                    </>
                ) : null}
            </AnimatePresence>
        </div>
    );

    return createPortal(modalContent, document.body);
}
