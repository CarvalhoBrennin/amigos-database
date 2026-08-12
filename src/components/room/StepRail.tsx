import { useEffect, useRef } from 'react';
import { roomMeter, roomStepActive, roomStepDone, roomStepIdle } from '@/components/room/roomStyles';
import { cn } from '@/lib/cn';

export interface StepRailItem {
    id: string;
    label: string;
}

interface StepRailProps {
    items: StepRailItem[];
    activeIndex: number;
    navLabel: string;
    progressLabel: string;
    onSelect: (index: number) => void;
    className?: string;
}

/**
 * The sequence map: where the person is, what is behind them, what is left.
 * Every step is a real button so reviewing an earlier answer is one click away.
 */
export function StepRail({ items, activeIndex, navLabel, progressLabel, onSelect, className }: StepRailProps) {
    const railRef = useRef<HTMLDivElement>(null);
    const percentage = items.length > 1 ? (activeIndex / (items.length - 1)) * 100 : 100;

    useEffect(() => {
        const active = railRef.current?.querySelector('[aria-current="step"]');
        if (active instanceof HTMLElement && typeof active.scrollIntoView === 'function') {
            active.scrollIntoView({ block: 'nearest', inline: 'center' });
        }
    }, [activeIndex]);

    return (
        <div className={cn('room-step-rail', className)}>
            <div
                className={roomMeter}
                role="progressbar"
                aria-label={progressLabel}
                aria-valuemin={1}
                aria-valuemax={items.length}
                aria-valuenow={activeIndex + 1}
            >
                <div className="room-meter__fill" style={{ width: `${Math.max(percentage, 5)}%` }} />
            </div>

            <nav className="room-rail mt-4" aria-label={navLabel} ref={railRef}>
                {items.map((item, index) => (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelect(index)}
                        aria-current={index === activeIndex ? 'step' : undefined}
                        className={
                            index === activeIndex
                                ? roomStepActive
                                : index < activeIndex ? roomStepDone : roomStepIdle
                        }
                    >
                        <span className="font-mono text-xs opacity-70">{String(index + 1).padStart(2, '0')}</span>
                        {item.label}
                    </button>
                ))}
            </nav>
        </div>
    );
}
