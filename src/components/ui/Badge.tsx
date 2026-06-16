import { type ReactNode } from 'react';

interface BadgeProps {
    children: ReactNode;
    variant?: 'default' | 'outline';
    className?: string;
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
    const baseStyles = 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium';

    const variants = {
        default: 'bg-stone-800 text-stone-300',
        outline: 'border border-stone-700 text-stone-400',
    };

    return (
        <span className={`${baseStyles} ${variants[variant]} ${className}`}>
            {children}
        </span>
    );
}
