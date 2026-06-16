import type { Variants, Transition } from 'framer-motion';

// Curvas
export const easings = {
    // Suave e natural
    smooth: [0.4, 0, 0.2, 1],
    // Entrada rápida, saída suave
    easeOut: [0, 0, 0.2, 1],
    // Entrada suave, saída rápida
    easeIn: [0.4, 0, 1, 1],
    // bounce
    bounce: [0.68, -0.55, 0.265, 1.55],
    // elástico
    elastic: [0.68, -0.6, 0.32, 1.6],
} as const;

// Transições
export const transitions = {
    spring: {
        type: 'spring',
        stiffness: 200,
        damping: 25,
    } as Transition,

    springBouncy: {
        type: 'spring',
        stiffness: 300,
        damping: 25,
    } as Transition,

    springGentle: {
        type: 'spring',
        stiffness: 150,
        damping: 30,
    } as Transition,

    smooth: {
        duration: 0.2,
        ease: easings.smooth,
    } as Transition,

    fast: {
        duration: 0.1,
        ease: easings.smooth,
    } as Transition,

    slow: {
        duration: 0.3,
        ease: easings.smooth,
    } as Transition,
};

// Fade
export const fadeIn: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: transitions.smooth,
    },
    exit: {
        opacity: 0,
        transition: transitions.fast,
    },
};

export const fadeInUp: Variants = {
    hidden: {
        opacity: 0,
        y: 20,
    },
    visible: {
        opacity: 1,
        y: 0,
        transition: transitions.spring,
    },
    exit: {
        opacity: 0,
        y: -10,
        transition: transitions.fast,
    },
};

export const fadeInDown: Variants = {
    hidden: {
        opacity: 0,
        y: -20,
    },
    visible: {
        opacity: 1,
        y: 0,
        transition: transitions.spring,
    },
    exit: {
        opacity: 0,
        y: 20,
        transition: transitions.fast,
    },
};

export const fadeInScale: Variants = {
    hidden: {
        opacity: 0,
        scale: 0.95,
    },
    visible: {
        opacity: 1,
        scale: 1,
        transition: transitions.springBouncy,
    },
    exit: {
        opacity: 0,
        scale: 0.95,
        transition: transitions.fast,
    },
};

// Slide
export const slideInLeft: Variants = {
    hidden: {
        x: -30,
        opacity: 0,
    },
    visible: {
        x: 0,
        opacity: 1,
        transition: transitions.spring,
    },
    exit: {
        x: 30,
        opacity: 0,
        transition: transitions.fast,
    },
};

export const slideInRight: Variants = {
    hidden: {
        x: 30,
        opacity: 0,
    },
    visible: {
        x: 0,
        opacity: 1,
        transition: transitions.spring,
    },
    exit: {
        x: -30,
        opacity: 0,
        transition: transitions.fast,
    },
};

// Scale
export const scaleIn: Variants = {
    hidden: {
        scale: 0.8,
        opacity: 0,
    },
    visible: {
        scale: 1,
        opacity: 1,
        transition: transitions.springBouncy,
    },
    exit: {
        scale: 0.8,
        opacity: 0,
        transition: transitions.fast,
    },
};

export const popIn: Variants = {
    hidden: {
        scale: 0.5,
        opacity: 0,
    },
    visible: {
        scale: 1,
        opacity: 1,
        transition: {
            type: 'spring',
            stiffness: 500,
            damping: 25,
        },
    },
    exit: {
        scale: 0.5,
        opacity: 0,
        transition: transitions.fast,
    },
};

// Stagger
export const staggerContainer: Variants = {
    hidden: { opacity: 1 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.04,
            delayChildren: 0.05,
        },
    },
};

export const staggerContainerFast: Variants = {
    hidden: { opacity: 1 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.02,
            delayChildren: 0.02,
        },
    },
};

/** Entrada de card no catálogo. */
export const catalogCardReveal: Variants = {
    hidden: {
        opacity: 0,
        y: 14,
        scale: 0.98,
    },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: {
            duration: 0.32,
            ease: [0.4, 0, 0.2, 1],
        },
    },
};

export const catalogGridExit: Variants = {
    hidden: { opacity: 1 },
    visible: { opacity: 1 },
    exit: {
        opacity: 0,
        scale: 0.985,
        transition: { duration: 0.14, ease: [0.4, 0, 1, 1] },
    },
};

export const staggerContainerSlow: Variants = {
    hidden: { opacity: 1 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.06,
            delayChildren: 0.1,
        },
    },
};

// Cards
export const cardHover3D = {
    rest: {
        rotateX: 0,
        rotateY: 0,
        scale: 1,
        transition: transitions.springGentle,
    },
    hover: {
        scale: 1.02,
        transition: transitions.springGentle,
    },
};

export const cardItem: Variants = {
    hidden: {
        opacity: 0,
        y: 30,
        scale: 0.95,
    },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: transitions.spring,
    },
    exit: {
        opacity: 0,
        y: -20,
        scale: 0.95,
        transition: transitions.fast,
    },
};

// Modal
export const modalBackdrop: Variants = {
    hidden: {
        opacity: 0,
        backdropFilter: 'blur(0px)',
    },
    visible: {
        opacity: 1,
        backdropFilter: 'blur(4px)',
        transition: {
            duration: 0.2,
            ease: easings.smooth,
        },
    },
    exit: {
        opacity: 0,
        backdropFilter: 'blur(0px)',
        transition: {
            duration: 0.1,
        },
    },
};

export const modalContent: Variants = {
    hidden: {
        opacity: 0,
        scale: 0.95,
        y: 20,
    },
    visible: {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: {
            type: 'spring',
            stiffness: 200,
            damping: 30,
            delay: 0.05,
        },
    },
    exit: {
        opacity: 0,
        scale: 0.98,
        y: 15,
        transition: {
            duration: 0.1,
            ease: easings.easeIn,
        },
    },
};

// Navbar
export const navbarSlide: Variants = {
    hidden: {
        y: -30,
        opacity: 0,
    },
    visible: {
        y: 0,
        opacity: 1,
        transition: {
            type: 'spring',
            stiffness: 200,
            damping: 20,
        },
    },
};

export const navItemActive: Variants = {
    initial: {
        scale: 0.95,
        opacity: 0,
    },
    animate: {
        scale: 1,
        opacity: 1,
        transition: {
            type: 'spring',
            stiffness: 400,
            damping: 25,
        },
    },
};

// Página
export const pageTransition: Variants = {
    initial: {
        opacity: 0,
        y: 10,
        filter: 'blur(2px)',
    },
    animate: {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        transition: {
            duration: 0.2,
            ease: easings.smooth,
        },
    },
    exit: {
        opacity: 0,
        y: -5,
        filter: 'blur(2px)',
        transition: {
            duration: 0.15,
            ease: easings.easeIn,
        },
    },
};

// Botão
export const buttonTap = {
    scale: 0.98,
    transition: { duration: 0.05 },
};

export const buttonHover = {
    scale: 1.02,
    transition: transitions.fast,
};

// Ícones
export const iconSpin: Variants = {
    initial: { rotate: 0 },
    animate: {
        rotate: 360,
        transition: {
            duration: 0.4,
            ease: 'easeInOut',
        },
    },
};

export const iconPulse: Variants = {
    initial: { scale: 1 },
    animate: {
        scale: [1, 1.1, 1],
        transition: {
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
        },
    },
};

export const iconBounce: Variants = {
    initial: { y: 0 },
    animate: {
        y: [0, -5, 0],
        transition: {
            duration: 0.6,
            repeat: Infinity,
            ease: 'easeInOut',
        },
    },
};

// Glow
export const glowPulse: Variants = {
    initial: {
        boxShadow: '0 0 0 rgba(245, 158, 11, 0)',
    },
    animate: {
        boxShadow: [
            '0 0 0 rgba(245, 158, 11, 0)',
            '0 0 20px rgba(245, 158, 11, 0.3)',
            '0 0 0 rgba(245, 158, 11, 0)',
        ],
        transition: {
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
        },
    },
};

// Barra de progresso
export const progressBar = (percentage: number): Variants => ({
    initial: { width: 0 },
    animate: {
        width: `${percentage}%`,
        transition: {
            duration: 0.8,
            delay: 0.3,
            ease: easings.smooth,
        },
    },
});

// Flutuar
export const floating: Variants = {
    initial: { y: 0 },
    animate: {
        y: [0, -10, 0],
        transition: {
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
        },
    },
};

// Delay escalonado
export const getStaggerDelay = (index: number, baseDelay = 0.05) => ({
    delay: index * baseDelay,
});
