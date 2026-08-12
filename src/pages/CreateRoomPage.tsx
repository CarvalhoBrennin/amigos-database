import { useRef, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, CircleDot, Trophy, Users, Wand2 } from 'lucide-react';
import { createIdempotencyKey, createRoom } from '@/services/roomApi';
import { Button } from '@/components/ui/Button';
import { roomCabinetAmber, roomCard, roomMarqueeAmber } from '@/components/room/roomStyles';
import { RoomShell } from '@/components/room/RoomShell';

export function CreateRoomPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [nickname, setNickname] = useState('');
    const pendingCreateRef = useRef<{ nickname: string; idempotencyKey: string } | null>(null);
    const mutation = useMutation({
        mutationFn: () => {
            const normalizedNickname = nickname.trim();
            const pendingCreate = pendingCreateRef.current;
            if (!pendingCreate || pendingCreate.nickname !== normalizedNickname) {
                pendingCreateRef.current = {
                    nickname: normalizedNickname,
                    idempotencyKey: createIdempotencyKey(),
                };
            }
            const idempotencyKey = pendingCreateRef.current?.idempotencyKey;
            if (!idempotencyKey) {
                throw new Error('Unable to create an idempotency key');
            }
            return createRoom(normalizedNickname, idempotencyKey);
        },
        onSuccess: (result) => {
            pendingCreateRef.current = null;
            navigate(`/r/${result.room.code}`, {
                state: { shareUrl: result.invite.shareUrl },
                replace: true,
            });
        },
    });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (nickname.trim().length >= 2) {
            mutation.mutate();
        }
    };

    const beats = [
        { icon: Users, title: t('room.create.flowEnterTitle'), body: t('room.create.flowEnterBody') },
        { icon: Wand2, title: t('room.create.flowSetupTitle'), body: t('room.create.flowSetupBody') },
        { icon: Trophy, title: t('room.create.flowDecideTitle'), body: t('room.create.flowDecideBody') },
    ];

    return (
        <RoomShell className="create-room-shell">
            <div className="create-room-stage">
                <section className="create-room-intro" aria-labelledby="create-room-title">
                    <div className="create-room-index">
                        <span>{t('room.create.eyebrow')}</span>
                        <span aria-hidden="true">SESSÃO / 001</span>
                    </div>
                    <h1 id="create-room-title" className="create-room-title text-stone-100">
                        {t('room.create.title')}
                    </h1>
                    <p className="create-room-lead text-stone-300">{t('room.create.description')}</p>
                </section>

                <section className={`${roomCabinetAmber} create-room-console`} aria-labelledby="create-room-console-title">
                    <div className={`${roomMarqueeAmber} create-room-console__header`}>
                        <h2 id="create-room-console-title" className="text-sm font-bold uppercase tracking-[0.16em] text-stone-100">
                            {t('room.create.kicker')}
                        </h2>
                        <span className="create-room-console__signal font-mono text-[0.68rem] uppercase tracking-[0.16em] text-emerald-300">
                            <CircleDot className="h-3.5 w-3.5" aria-hidden="true" />
                            pronto
                        </span>
                    </div>

                    <div className="create-room-console__body">
                        <p className="font-mono text-xs uppercase tracking-[0.2em] text-amber-400">IDENTIDADE</p>
                        <h3 className="mt-4 text-3xl font-bold leading-tight text-stone-100 sm:text-4xl">
                            {t('room.create.nicknameLabel')}
                        </h3>
                        <p className="mt-3 max-w-md text-sm leading-relaxed text-stone-400">{t('room.create.nicknameHelp')}</p>

                        <form className="mt-8" onSubmit={submit} noValidate>
                            <label className="sr-only" htmlFor="host-nickname">{t('room.create.nicknameLabel')}</label>
                            <input
                                id="host-nickname"
                                value={nickname}
                                onChange={(event) => setNickname(event.target.value)}
                                minLength={2}
                                maxLength={32}
                                autoComplete="nickname"
                                required
                                placeholder={t('room.create.nicknamePlaceholder')}
                                className="create-room-input w-full border border-stone-700 bg-stone-900 px-4 py-4 text-lg text-stone-100 placeholder:text-stone-500 focus:border-amber-500 focus:outline-none"
                            />

                            {mutation.error ? (
                                <p role="alert" className={`${roomCard} mt-4 border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-red-400`}>
                                    {t('room.create.error')}
                                </p>
                            ) : null}

                            <Button
                                type="submit"
                                size="lg"
                                className="create-room-submit mt-4 w-full"
                                isLoading={mutation.isPending}
                                disabled={mutation.isPending || nickname.trim().length < 2}
                            >
                                {mutation.isPending ? t('room.create.pending') : t('room.create.submit')}
                                {!mutation.isPending ? <ArrowUpRight className="ml-2 h-5 w-5" aria-hidden="true" /> : null}
                            </Button>
                        </form>

                        <p className="create-room-console__footnote mt-auto border-t border-stone-800 pt-5 text-sm text-stone-500">
                            {t('room.create.footnote')}
                        </p>
                    </div>
                </section>

                <ol className="create-room-sequence" aria-label={t('room.create.description')}>
                    {beats.map((beat, index) => (
                        <li key={beat.title} className="create-room-sequence__item">
                            <span className="create-room-sequence__number" aria-hidden="true">
                                {String(index + 1).padStart(2, '0')}
                            </span>
                            <beat.icon className="h-5 w-5 text-amber-400" aria-hidden="true" />
                            <span className="min-w-0">
                                <strong className="block text-sm font-semibold text-stone-100">{beat.title}</strong>
                                <span className="mt-1 block text-xs leading-relaxed text-stone-500">{beat.body}</span>
                            </span>
                        </li>
                    ))}
                </ol>
            </div>
        </RoomShell>
    );
}
