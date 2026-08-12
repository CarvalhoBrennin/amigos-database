import { useTranslation } from 'react-i18next';
import { Crown } from 'lucide-react';
import type { ParticipantPublicSnapshot } from '@shared/index';
import { activeParticipants } from '@/components/room/roomSelectors';
import { roomCabinet, roomMarquee, roomMeter } from '@/components/room/roomStyles';
import { cn } from '@/lib/cn';

function initial(nickname: string): string {
    return [...nickname.trim()][0]?.toUpperCase() ?? '?';
}

interface RoomRosterProps {
    participants: ParticipantPublicSnapshot[];
    currentParticipantId: string;
}

/** The room seen from the inside: who is here and how close the group is to deciding. */
export function RoomRoster({ participants, currentParticipantId }: RoomRosterProps) {
    const { t } = useTranslation();
    const people = activeParticipants(participants);
    const readyCount = people.filter((participant) => participant.status === 'READY').length;

    return (
        <section className={`${roomCabinet} room-roster`} aria-labelledby="room-roster-title">
            <div className={roomMarquee}>
                <h2 id="room-roster-title" className="text-lg font-bold text-stone-100">
                    {t('room.lobby.participants')}
                </h2>
                <span className="font-mono text-sm text-stone-400">
                    {t('room.lobby.readyCount', { ready: readyCount, total: people.length })}
                </span>
            </div>

            <div className="room-roster__body p-5">
                <div className={roomMeter}>
                    <div
                        className="room-meter__fill"
                        style={{ width: `${people.length === 0 ? 0 : (readyCount / people.length) * 100}%` }}
                    />
                </div>

                <ul className="mt-5 space-y-2">
                    {people.map((participant) => {
                        const ready = participant.status === 'READY';
                        return (
                            <li
                                key={participant.id}
                                className={cn(
                                    'flex items-center gap-3 rounded-xl border border-stone-800 bg-stone-900 px-3 py-3',
                                    participant.id === currentParticipantId && 'border-amber-500/40'
                                )}
                            >
                                <span
                                    aria-hidden="true"
                                    className={cn(
                                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-stone-700 font-mono text-sm',
                                        ready ? 'text-emerald-400' : 'text-stone-400'
                                    )}
                                >
                                    {initial(participant.nickname)}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-1.5 truncate font-semibold text-stone-100">
                                        {participant.nickname}
                                        {participant.role === 'HOST' ? (
                                            <Crown className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-label={t('room.lobby.host')} />
                                        ) : null}
                                    </span>
                                    {participant.id === currentParticipantId ? (
                                        <span className="block text-sm text-stone-500">{t('room.lobby.you')}</span>
                                    ) : null}
                                </span>
                                <span className={cn('shrink-0 text-sm font-semibold', ready ? 'text-emerald-400' : 'text-stone-500')}>
                                    {ready ? t('room.lobby.ready') : t('room.lobby.configuring')}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </section>
    );
}
