import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { RoomApiError } from '@/services/roomApi';

/** Every failed mutation says the same thing in the same place, so nothing fails silently. */
export function MutationError({ error }: { error: unknown }) {
    const { t } = useTranslation();
    const conflict = error instanceof RoomApiError && error.code === 'ROOM_VERSION_CONFLICT';

    return (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{`${t('room.errors.save')}${conflict ? t('room.errors.versionRefresh') : ''}`}</span>
        </p>
    );
}
