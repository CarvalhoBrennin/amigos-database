import { useId, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { roomChoiceIdle, roomChoiceSelected } from '@/components/room/roomStyles';
import { cn } from '@/lib/cn';

interface ChoiceTileProps {
    type: 'checkbox' | 'radio';
    name?: string;
    checked: boolean;
    onChange: () => void;
    label: string;
    hint?: string;
    icon?: ReactNode;
    stacked?: boolean;
}

/**
 * One answer, one large target. The native input stays visible and focusable on
 * purpose: keyboard, screen readers and automated tests all drive it directly.
 */
export function ChoiceTile({ type, name, checked, onChange, label, hint, icon, stacked }: ChoiceTileProps) {
    const hintId = useId();

    return (
        <label
            className={cn(
                checked ? roomChoiceSelected : roomChoiceIdle,
                stacked && 'room-choice--stacked'
            )}
        >
            <span className={cn('flex items-center gap-3', stacked && 'w-full justify-between')}>
                <input
                    type={type}
                    name={name}
                    checked={checked}
                    onChange={onChange}
                    aria-label={label}
                    aria-describedby={hint ? hintId : undefined}
                />
                {icon ? <span aria-hidden="true" className="flex items-center text-stone-400">{icon}</span> : null}
                {stacked ? (
                    <Check
                        aria-hidden="true"
                        className={cn('h-5 w-5 text-amber-400 transition-opacity', checked ? 'opacity-100' : 'opacity-0')}
                    />
                ) : null}
            </span>

            <span className={cn('min-w-0', !stacked && 'flex-1')}>
                <span className="block font-semibold text-stone-100">{label}</span>
                {hint ? (
                    <span className="mt-0.5 block text-sm leading-snug text-stone-500" id={hintId}>{hint}</span>
                ) : null}
            </span>

            {stacked ? null : (
                <Check
                    aria-hidden="true"
                    className={cn('h-5 w-5 shrink-0 text-amber-400 transition-opacity', checked ? 'opacity-100' : 'opacity-0')}
                />
            )}
        </label>
    );
}
