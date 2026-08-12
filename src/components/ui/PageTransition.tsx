import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useOutlet } from 'react-router-dom';
import { useAnimations } from '@/components/animation-context';

const pageVariants = {
    initial: {
        opacity: 0,
        y: 4,
    },
    enter: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.1,
            ease: [0.4, 0, 0.2, 1],
        },
    },
    exit: {
        opacity: 0,
        y: -4,
        transition: {
            duration: 0.08,
            ease: [0.4, 0, 1, 1],
        },
    },
};

const pageVariantsReduced = {
    initial: {
        opacity: 0,
    },
    enter: {
        opacity: 1,
        transition: {
            duration: 0.05,
        },
    },
    exit: {
        opacity: 0,
        transition: {
            duration: 0.05,
        },
    },
};

export function PageTransition() {
    const location = useLocation();
    const outlet = useOutlet();
    const { animationsEnabled, performanceMode } = useAnimations();

    if (!animationsEnabled) {
        return outlet;
    }

    const variants = performanceMode ? pageVariantsReduced : pageVariants;

    return (
        <AnimatePresence mode="wait" initial={false}>
            <motion.div
                key={location.pathname}
                className="page-transition-frame"
                variants={variants}
                initial="initial"
                animate="enter"
                exit="exit"
            >
                {outlet}
            </motion.div>
        </AnimatePresence>
    );
}
