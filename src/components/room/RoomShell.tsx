import { useLayoutEffect, type ReactNode } from 'react';
import { Gamepad2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { roomCabinet, roomCabinetAmber } from '@/components/room/roomStyles';
import { cn } from '@/lib/cn';

/**
 * The Decision Room is a mode, not a page: while one is mounted the catalog
 * wallpaper pulls back so the room reads as an enclosed cabin. Reference
 * counted so navigating create -> lobby never flashes the catalog.
 */
let mountedRoomShells = 0;

function enterRoomMode(): () => void {
    const root = document.documentElement;
    mountedRoomShells += 1;
    root.classList.add('decision-room-active');

    return () => {
        mountedRoomShells = Math.max(0, mountedRoomShells - 1);
        if (mountedRoomShells === 0) {
            root.classList.remove('decision-room-active');
        }
    };
}

const widths = {
    narrow: 'max-w-4xl',
    wide: 'max-w-none',
} as const;

interface RoomShellProps {
    children: ReactNode;
    width?: keyof typeof widths;
    /** Entry screens read better centred in the canvas, like a door. */
    centered?: boolean;
    className?: string;
}

export function RoomShell({ children, width = 'wide', centered, className }: RoomShellProps) {
    useLayoutEffect(() => enterRoomMode(), []);

    return (
        <div className="decision-room relative min-h-full">
            <Link to="/catalog" className="decision-room__brand group" aria-label="AMIGOSDB — Catálogo de Jogos">
                <span className="decision-room__brand-mark" aria-hidden="true">
                    <Gamepad2 className="h-4 w-4 text-amber-400" />
                </span>
                <span className="decision-room__brand-name">
                    AMIGOS<span>DB</span>
                </span>
            </Link>
            <main
                className={cn(
                    'decision-room__canvas relative z-10 mx-auto w-full',
                    centered && 'decision-room__canvas--centered flex flex-col justify-center',
                    widths[width],
                    className
                )}
            >
                {children}
            </main>
        </div>
    );
}

interface RoomNoticeProps {
    title: string;
    detail: string;
    tone?: 'neutral' | 'error';
    role?: 'status' | 'alert';
    action?: ReactNode;
}

/** Loading, empty and failure states keep the room's framing instead of bare text. */
export function RoomNotice({ title, detail, tone = 'neutral', role = 'status', action }: RoomNoticeProps) {
    return (
        <RoomShell width="narrow" centered>
            <section
                className={cn('mx-auto max-w-xl px-6 py-12 text-center sm:px-10', tone === 'error' ? roomCabinetAmber : roomCabinet)}
                role={role}
                aria-live={role === 'status' ? 'polite' : undefined}
            >
                <h1 className="text-2xl font-bold text-stone-100 sm:text-3xl">{title}</h1>
                <p className="mx-auto mt-3 max-w-sm text-stone-400">{detail}</p>
                {action ? <div className="mt-7 flex justify-center">{action}</div> : null}
            </section>
        </RoomShell>
    );
}
