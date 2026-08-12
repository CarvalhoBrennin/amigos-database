import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CircleAlert, DatabaseZap, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getAdminDashboard } from '@/services/adminApi';
import {
    AdminEmpty,
    AdminFeedback,
    AdminLoading,
    AdminMetric,
    AdminPageHeader,
    AdminPanel,
    formatAdminDate,
    getAdminErrorMessage,
} from './AdminPrimitives';

export function AdminDashboardPanel({ onNavigate }: { onNavigate: (section: 'rooms' | 'catalog' | 'system') => void }) {
    const query = useQuery({
        queryKey: ['admin', 'dashboard'],
        queryFn: getAdminDashboard,
        refetchInterval: 60_000,
    });

    return (
        <div className="admin-page">
            <AdminPageHeader
                eyebrow="Pulso do produto"
                title="Visão geral"
                description="Um retrato operacional das salas e da qualidade dos dados de decisão."
                actions={(
                    <Button variant="secondary" onClick={() => void query.refetch()} isLoading={query.isFetching}>
                        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> Atualizar
                    </Button>
                )}
            />
            {query.isLoading ? <AdminLoading /> : query.error ? <AdminFeedback message={getAdminErrorMessage(query.error)} /> : query.data ? (
                <>
                    <section className="admin-metrics-grid" aria-label="Indicadores principais">
                        <AdminMetric label="Salas ativas" value={query.data.rooms.active} detail={`${query.data.rooms.total} registradas`} tone="good" />
                        <AdminMetric label="Pessoas ativas" value={query.data.participants.active} detail={`${query.data.participants.total} participações`} />
                        <AdminMetric label="Sessões guest" value={query.data.sessions.guestActive} detail={`${query.data.sessions.adminActive} admins conectados`} />
                        <AdminMetric
                            label="Dados completos"
                            value={`${query.data.decisionData.complete}/${query.data.decisionData.catalogGames}`}
                            detail={`${query.data.decisionData.missing} sem perfil`}
                            tone={query.data.decisionData.missing > 0 ? 'warning' : 'good'}
                        />
                    </section>
                    <div className="admin-dashboard-grid">
                        <AdminPanel title="Ciclo das salas" description="Distribuição do estado autoritativo no PostgreSQL.">
                            <div className="admin-state-bars">
                                <StateBar label="No lobby" value={query.data.rooms.lobby} total={query.data.rooms.total} />
                                <StateBar label="Em votação" value={query.data.rooms.matching} total={query.data.rooms.total} />
                                <StateBar label="Concluídas" value={query.data.rooms.completed} total={query.data.rooms.total} />
                            </div>
                            <button type="button" className="admin-text-link" onClick={() => onNavigate('rooms')}>
                                Abrir gestão de salas <ArrowRight aria-hidden="true" />
                            </button>
                        </AdminPanel>
                        <AdminPanel title="Qualidade dos dados" description="Ausência nunca é tratada como evidência verificada.">
                            <dl className="admin-definition-list">
                                <div><dt>Completos</dt><dd>{query.data.decisionData.complete}</dd></div>
                                <div><dt>Parciais</dt><dd>{query.data.decisionData.partial}</dd></div>
                                <div><dt>Desconhecidos</dt><dd>{query.data.decisionData.unknown}</dd></div>
                                <div><dt>Registros vencidos</dt><dd>{query.data.decisionData.staleRecords}</dd></div>
                            </dl>
                            <button type="button" className="admin-text-link" onClick={() => onNavigate('catalog')}>
                                Revisar dados dos jogos <ArrowRight aria-hidden="true" />
                            </button>
                        </AdminPanel>
                        <AdminPanel
                            className="admin-dashboard-alerts"
                            title="Ações necessárias"
                            description="Itens que merecem atenção do operador."
                        >
                            {query.data.rooms.expiredPendingPurge === 0 && query.data.decisionData.staleRecords === 0
                                ? <AdminEmpty title="Tudo em ordem" description="Nenhuma pendência operacional detectada agora." />
                                : (
                                    <div className="admin-alert-list">
                                        {query.data.rooms.expiredPendingPurge > 0 ? (
                                            <button type="button" onClick={() => onNavigate('system')}>
                                                <DatabaseZap aria-hidden="true" />
                                                <span><strong>{query.data.rooms.expiredPendingPurge} salas expiradas</strong><small>Execute a retenção para remover dados vencidos.</small></span>
                                                <ArrowRight aria-hidden="true" />
                                            </button>
                                        ) : null}
                                        {query.data.decisionData.staleRecords > 0 ? (
                                            <button type="button" onClick={() => onNavigate('catalog')}>
                                                <CircleAlert aria-hidden="true" />
                                                <span><strong>{query.data.decisionData.staleRecords} registros vencidos</strong><small>Revalide a fonte ou marque como desconhecido.</small></span>
                                                <ArrowRight aria-hidden="true" />
                                            </button>
                                        ) : null}
                                    </div>
                                )}
                        </AdminPanel>
                    </div>
                    <p className="admin-generated-at">Atualizado em {formatAdminDate(query.data.generatedAt)}</p>
                </>
            ) : null}
        </div>
    );
}

function StateBar({ label, value, total }: { label: string; value: number; total: number }) {
    const percentage = total === 0 ? 0 : Math.max(2, Math.round((value / total) * 100));
    return (
        <div className="admin-state-bar">
            <span><strong>{label}</strong><small>{value}</small></span>
            <div aria-label={`${label}: ${value}`} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={value}>
                <span style={{ width: `${percentage}%` }} />
            </div>
        </div>
    );
}
