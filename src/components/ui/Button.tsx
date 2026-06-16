import { type ReactNode, type MouseEventHandler } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { buttonHover, buttonTap, transitions } from '@/lib/animations';
import { LoadingSpinner } from '@/components/ui/loading/LoadingSpinner';

interface ButtonBaseProps {
    variant?: 'primary' | 'secondary' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
    disabled?: boolean;
    className?: string;
    children?: ReactNode;
    onClick?: MouseEventHandler<HTMLElement>;
    type?: 'button' | 'submit' | 'reset';
}

interface ButtonAsButtonProps extends ButtonBaseProps {
    to?: undefined;
}

interface ButtonAsLinkProps extends ButtonBaseProps {
    to: string;
}

export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

const MotionLink = motion.create(Link);

function getButtonClassName(
    variant: NonNullable<ButtonBaseProps['variant']>,
    size: NonNullable<ButtonBaseProps['size']>,
    className: string
) {
    const baseStyles = 'inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-200 focus-ring disabled:opacity-50 disabled:cursor-not-allowed';

    const variants = {
        primary: 'bg-amber-500 text-stone-950 hover:bg-amber-400 active:bg-amber-600 hover:shadow-lg hover:shadow-amber-500/25',
        secondary: 'bg-stone-800 text-stone-100 hover:bg-stone-700 border border-stone-700 hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/10',
        ghost: 'bg-transparent text-stone-400 hover:text-stone-100 hover:bg-stone-800/50',
    };

    const sizes = {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-4 py-2 text-sm',
        lg: 'px-6 py-3 text-base',
    };

    return `${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`;
}

export function Button({
    className = '',
    variant = 'primary',
    size = 'md',
    isLoading = false,
    children,
    disabled = false,
    onClick,
    type = 'button',
    to,
}: ButtonProps) {
    const combinedClassName = getButtonClassName(variant, size, className);

    const content = (
        <>
            {isLoading ? <LoadingSpinner size="sm" tone="neutral" className="mr-2" /> : null}
            {children}
        </>
    );

    if (to) {
        return (
            <MotionLink
                to={to}
                className={combinedClassName}
                onClick={(event) => {
                    if (disabled) {
                        event.preventDefault();
                        return;
                    }

                    onClick?.(event);
                }}
                aria-disabled={disabled || undefined}
                tabIndex={disabled ? -1 : undefined}
                whileHover={disabled ? undefined : buttonHover}
                whileTap={disabled ? undefined : buttonTap}
                transition={transitions.springBouncy}
            >
                {content}
            </MotionLink>
        );
    }

    return (
        <motion.button
            whileHover={disabled ? undefined : buttonHover}
            whileTap={disabled ? undefined : buttonTap}
            transition={transitions.springBouncy}
            className={combinedClassName}
            disabled={disabled || isLoading}
            aria-busy={isLoading || undefined}
            onClick={onClick}
            type={type}
        >
            {content}
        </motion.button>
    );
}
