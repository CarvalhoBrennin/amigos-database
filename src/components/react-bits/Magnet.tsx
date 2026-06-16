import { useRef, type ReactNode, type MouseEvent } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

interface MagnetProps {
    children: ReactNode;
    className?: string;
    padding?: number;
    disabled?: boolean;
    magnetStrength?: number;
}

export function Magnet({
    children,
    className = '',
    padding = 50,
    disabled = false,
    magnetStrength = 0.3,
}: MagnetProps) {
    const ref = useRef<HTMLDivElement>(null);

    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const springConfig = { stiffness: 150, damping: 15, mass: 0.1 };
    const xSpring = useSpring(x, springConfig);
    const ySpring = useSpring(y, springConfig);

    const handleMouseMove = (e: MouseEvent) => {
        if (disabled || !ref.current) return;

        const rect = ref.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const distX = (e.clientX - centerX) * magnetStrength;
        const distY = (e.clientY - centerY) * magnetStrength;

        x.set(distX);
        y.set(distY);
    };

    const handleMouseLeave = () => {
        x.set(0);
        y.set(0);
    };

    return (
        <motion.div
            ref={ref}
            className={`inline-block ${className}`}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{
                x: xSpring,
                y: ySpring,
                padding: `${padding}px`,
                margin: `-${padding}px`,
            }}
        >
            {children}
        </motion.div>
    );
}
