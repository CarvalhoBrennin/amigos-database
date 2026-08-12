import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock3, DoorOpen, Search, Trash2, UserRound, Vote, XCircle } from 'lucide-react';
import type { AdminSession } from '@shared/index';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
    deleteAdminRoom,
    getAdminRoom,
    listAdminRooms,
    updateAdminRoom,
} from '@/services/adminApi';
import {
    AdminEmpty,
    AdminFeedback,
    AdminLoading,
    AdminPageHeader,
    AdminPagination,
    AdminPanel,
    AdminStatus,
    adminInputClass,
    adminSelectClass,
    formatAdminDate,
    getAdminErrorMessage,
} from './AdminPrimitives';

export function AdminRoomsPanel({ session }: { session: AdminSession }) {
    const [page, setPage] = useState(1);
    const [searchDraft, setSearchDraft] = useState('');
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
    const canWrite = session.permissions.includes('ROOMS_WRITE');
    const query = useQuery({
        queryKey: ['admin', 'rooms', page, search, status],
        queryFn: () => listAdminRooms({ page, pageSize: 25, search, status }),
    });

    const submitSearch = (event: FormEvent) => {
        event.preventDefault();
        setPage(1);
        setSearch(searchDraft.trim());
    };

    return (
        <div className="admin-page">
            <AdminPageHeader
                eyebrow="Estado autoritativo"
                title="Salas"
                description="Inspecione o ciclo completo, intervenha em incidentes e remova somente com confirmação explícita."
            />
            <AdminPanel>
                <form className="admin-toolbar" onSubmit={submitSearch}>
                    <label className="admin-search-field">
                        <span className="sr-only">Buscar por código ou apelido</span>
                        <Search aria-hidden="true" />
                        <input
                            className={adminInputClass}
                            value={searchDraft}
                            onChange={(event) => setSearchDraft(event.target.value)}
                            placeholder="Código ou apelido"
                            maxLength={100}
                        />
                    </label>
                    <label>
                        <span className="sr-only">Filtrar por estado</span>
                        <select className={adminSelectClass} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
                            <option value="">Todos os estados</option>
                            <option value="LOBBY">Lobby</option>
                            <option value="MATCHING">Votação</option>
                            <option value="SHORTLIST">Finalistas</option>
                            <option value="COMPLETED">Concluída</option>
                            <option value="CANCELLED">Cancelada</option>
                            <option value="EXPIRED">Expirada</option>
                        </select>
                    </label>
                    <Button type="submit" variant="secondary">Buscar</Button>
                </form>
                {query.isLoading ? <AdminLoading label="Carregando salas…" /> : query.error ? (
                    <AdminFeedback message={getAdminErrorMessage(query.error)} />
                ) : query.data && query.data.rooms.length > 0 ? (
                    <>
                        <div className="admin-table-wrap">
                            <table className="admin-table">
                                <thead><tr><th>Sala</th><th>Estado</th><th>Pessoas</th><th>Votos / matches</th><th>Expira em</th><th><span className="sr-only">Ações</span></th></tr></thead>
                                <tbody>
                                    {query.data.rooms.map((room) => (
                                        <tr key={room.id}>
                                            <td><strong className="admin-code">{room.code}</strong><small>{formatAdminDate(room.createdAt)}</small></td>
                                            <td><RoomStatus status={room.status} /></td>
                                            <td><span className="admin-cell-icon"><UserRound aria-hidden="true" /> {room.readyCount}/{room.participantCount} prontos</span></td>
                                            <td><span className="admin-cell-icon"><Vote aria-hidden="true" /> {room.voteCount} / {room.matchCount}</span></td>
                                            <td>{formatAdminDate(room.expiresAt)}</td>
                                            <td><Button size="sm" variant="ghost" onClick={() => setSelectedRoomId(room.id)}>Detalhes</Button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <AdminPagination {...query.data.meta} onChange={setPage} />
                    </>
                ) : <AdminEmpty title="Nenhuma sala encontrada" description="Ajuste os filtros ou aguarde uma nova sessão." />}
            </AdminPanel>
            <RoomDetailsModal
                roomId={selectedRoomId}
                canWrite={canWrite}
                canDelete={session.permissions.includes('ROOMS_DELETE')}
                onClose={() => setSelectedRoomId(null)}
            />
        </div>
    );
}

function RoomDetailsModal({ roomId, canWrite, canDelete, onClose }: {
    roomId: string | null;
    canWrite: boolean;
    canDelete: boolean;
    onClose: () => void;
}) {
    const queryClient = useQueryClient();
    const [extendHours, setExtendHours] = useState(24);
    const [deleteConfirmation, setDeleteConfirmation] = useState('');
    const [success, setSuccess] = useState('');
    const query = useQuery({
        queryKey: ['admin', 'room', roomId],
        queryFn: () => getAdminRoom(roomId as string),
        enabled: Boolean(roomId),
    });
    const mutation = useMutation({
        mutationFn: (input: { action: 'CANCEL' | 'EXPIRE' | 'EXTEND'; extendHours?: number }) => updateAdminRoom(roomId as string, input),
        onSuccess: (data, variables) => {
            queryClient.setQueryData(['admin', 'room', roomId], data);
            void queryClient.invalidateQueries({ queryKey: ['admin', 'rooms'] });
            void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
            setSuccess(variables.action === 'EXTEND' ? 'Validade estendida.' : variables.action === 'EXPIRE' ? 'Sala expirada.' : 'Sala cancelada.');
        },
    });
    const deleteMutation = useMutation({
        mutationFn: () => deleteAdminRoom(roomId as string, deleteConfirmation),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['admin', 'rooms'] });
            void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
            onClose();
        },
    });

    return (
        <Modal isOpen={Boolean(roomId)} onClose={onClose} ariaLabel="Detalhes da sala" size="wide">
            <div className="admin-modal admin-room-details">
                {query.isLoading ? <AdminLoading /> : query.error ? <AdminFeedback message={getAdminErrorMessage(query.error)} /> : query.data ? (
                    <>
                        <header className="admin-modal__header">
                            <div>
                                <p className="admin-eyebrow">Sala {query.data.code}</p>
                                <h2>Diagnóstico da sessão</h2>
                                <RoomStatus status={query.data.status} />
                            </div>
                            <div className="admin-room-version">v{query.data.version}</div>
                        </header>
                        <section className="admin-room-summary">
                            <div><UserRound aria-hidden="true" /><span><strong>{query.data.participantCount}</strong>Pessoas</span></div>
                            <div><Vote aria-hidden="true" /><span><strong>{query.data.voteCount}</strong>Votos</span></div>
                            <div><DoorOpen aria-hidden="true" /><span><strong>{query.data.matchCount}</strong>Matches</span></div>
                            <div><Clock3 aria-hidden="true" /><span><strong>{formatAdminDate(query.data.expiresAt)}</strong>Validade</span></div>
                        </section>
                        <div className="admin-room-detail-grid">
                            <section>
                                <h3>Participantes</h3>
                                <div className="admin-participant-list">
                                    {query.data.participants.map((participant) => (
                                        <article key={participant.id}>
                                            <div className="admin-avatar" aria-hidden="true">{participant.nickname.slice(0, 2).toUpperCase()}</div>
                                            <div><strong>{participant.nickname}</strong><span>{participant.role === 'HOST' ? 'Host' : 'Membro'} · {participant.platforms.join(', ') || 'Sem plataforma'}</span></div>
                                            <AdminStatus tone={participant.status === 'READY' ? 'good' : participant.status === 'LEFT' ? 'danger' : 'warning'}>{participant.status}</AdminStatus>
                                        </article>
                                    ))}
                                </div>
                            </section>
                            <section>
                                <h3>Persistência</h3>
                                <dl className="admin-definition-list">
                                    <div><dt>Candidatos</dt><dd>{query.data.candidateCount}</dd></div>
                                    <div><dt>Histórico</dt><dd>{query.data.historyCount}</dd></div>
                                    <div><dt>Decisão</dt><dd>{query.data.decision?.gameId ?? '—'}</dd></div>
                                    <div><dt>Região</dt><dd>{query.data.regionCode}</dd></div>
                                </dl>
                                <details className="admin-json-details">
                                    <summary>Restrições da sala</summary>
                                    <pre>{JSON.stringify(query.data.constraints, null, 2)}</pre>
                                </details>
                            </section>
                        </div>
                        {canWrite ? (
                            <section className="admin-danger-zone">
                                <h3>Intervenções operacionais</h3>
                                <p>Estas ações alteram o estado autoritativo e entram na auditoria.</p>
                                <div className="admin-action-row">
                                    <input className={adminInputClass} type="number" min={1} max={720} value={extendHours} onChange={(event) => setExtendHours(Number(event.target.value))} aria-label="Horas adicionais" />
                                    <Button variant="secondary" onClick={() => mutation.mutate({ action: 'EXTEND', extendHours })} disabled={mutation.isPending}>Estender validade</Button>
                                    <Button variant="secondary" onClick={() => mutation.mutate({ action: 'CANCEL' })} disabled={mutation.isPending || query.data.status === 'COMPLETED'}><XCircle className="mr-2 h-4 w-4" aria-hidden="true" /> Cancelar</Button>
                                    <Button variant="secondary" onClick={() => mutation.mutate({ action: 'EXPIRE' })} disabled={mutation.isPending}>Expirar agora</Button>
                                </div>
                                {mutation.error ? <AdminFeedback message={getAdminErrorMessage(mutation.error)} /> : null}
                                {success ? <AdminFeedback message={success} tone="success" /> : null}
                                {canDelete ? (
                                    <div className="admin-delete-confirmation">
                                        <label><span>Digite {query.data.code} para excluir definitivamente</span><input className={adminInputClass} value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} /></label>
                                        <Button variant="secondary" onClick={() => deleteMutation.mutate()} disabled={deleteConfirmation.toUpperCase() !== query.data.code || deleteMutation.isPending}>
                                            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Excluir sala
                                        </Button>
                                    </div>
                                ) : null}
                                {deleteMutation.error ? <AdminFeedback message={getAdminErrorMessage(deleteMutation.error)} /> : null}
                            </section>
                        ) : null}
                    </>
                ) : null}
            </div>
        </Modal>
    );
}

function RoomStatus({ status }: { status: string }) {
    const config: Record<string, { label: string; tone: 'neutral' | 'good' | 'warning' | 'danger' | 'info' }> = {
        LOBBY: { label: 'Lobby', tone: 'info' },
        MATCHING: { label: 'Votação', tone: 'warning' },
        SHORTLIST: { label: 'Finalistas', tone: 'warning' },
        COMPLETED: { label: 'Concluída', tone: 'good' },
        CANCELLED: { label: 'Cancelada', tone: 'danger' },
        EXPIRED: { label: 'Expirada', tone: 'neutral' },
    };
    const current = config[status] ?? { label: status, tone: 'neutral' as const };
    return <AdminStatus tone={current.tone}>{current.label}</AdminStatus>;
}
