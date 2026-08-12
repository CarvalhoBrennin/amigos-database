import { useId, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { roomCard } from '@/components/room/roomStyles';
import { ChoiceTile } from '@/components/room/ChoiceTile';

interface PreferenceDialProps {
    label: string;
    lowAnchor: string;
    highAnchor: string;
    value: number | null;
    onChange: (value: number | null) => void;
}

/**
 * A preference is a question, not a form field: one large dial, the two extremes
 * spelled out, and an explicit "no preference" answer. The control underneath is
 * a native range, so arrow keys and assistive tech behave as expected.
 */
export function PreferenceDial({ label, lowAnchor, highAnchor, value, onChange }: PreferenceDialProps) {
    const { t } = useTranslation();
    const inputId = useId();
    const skipped = value === null;

    return (
        <div className={`${roomCard} p-5 sm:p-6`}>
            <div className="flex items-end justify-between gap-6">
                <p className="text-3xl font-bold text-stone-100" aria-hidden="true">
                    {skipped ? (
                        <span className="text-xl text-stone-500">{t('room.setup.noPreferenceShort')}</span>
                    ) : (
                        <>
                            <span className="text-amber-400">{value}</span>
                            <span className="text-lg text-stone-500">/10</span>
                        </>
                    )}
                </p>
                <p className="max-w-[16rem] text-right text-sm text-stone-500">{t('room.setup.scaleHint')}</p>
            </div>

            <label className="sr-only" htmlFor={inputId}>{label}</label>
            <input
                id={inputId}
                type="range"
                min={0}
                max={10}
                step={1}
                value={value ?? 5}
                onChange={(event) => onChange(Number(event.target.value))}
                aria-valuetext={skipped ? t('room.setup.noPreference') : String(value)}
                style={{ '--room-dial-fill': `${skipped ? 0 : (value / 10) * 100}%` } as CSSProperties}
                className="room-dial mt-5"
            />

            <div className="mt-1 flex items-start justify-between gap-6 text-sm text-stone-400">
                <span className="max-w-[45%]">{lowAnchor}</span>
                <span className="max-w-[45%] text-right">{highAnchor}</span>
            </div>

            <div className="mt-5">
                <ChoiceTile
                    type="checkbox"
                    label={t('room.setup.noPreference')}
                    hint={t('room.setup.noPreferenceHint')}
                    checked={skipped}
                    onChange={() => onChange(skipped ? 5 : null)}
                />
            </div>
        </div>
    );
}
