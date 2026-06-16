import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

export function formatPlayersI18n(players: [number, number], t: TFunction): string {
    if (players[0] === players[1]) {
        return t('common.playerCountSingle', { count: players[0] });
    }

    return t('common.playerCountRange', { min: players[0], max: players[1] });
}

export function useFormatPlayers() {
    const { t } = useTranslation();
    return (players: [number, number]) => formatPlayersI18n(players, t);
}
