import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, ShieldX } from 'lucide-react';
import type { AdminSession } from '@shared/index';
import { Button } from '@/components/ui/Button';
import {
    listAdminGuestSessions,
    listManagedAdminSessions,
    revokeAdminGuestSession,
    revokeManagedAdminSession,
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
    formatAdminDate,
    getAdminErrorMessage,
} from './AdminPrimitives';

export function AdminSessionsPanel({ session, onSessionEnded }: { session: AdminSession; onSessionEnded: () => void }) {
    const [mode, setMode] = useState<'admin' | 'guest'>('admin');
    return (
        <div className="admin-page">
            <AdminPageHeader
                eyebrow="Controle de acesso ativo"
                title="Sessões"
                description="Encerre acessos administrativos ou guest sem jamais expor tokens, cookies ou hashes."
            />
            <div className="admin-tabs" role="tablist" aria-label="Tipos de sessão">
                <button type="button" role="tab" aria-selected={mode === 'admin'} onClick={() => setMode('admin')}>Administrativas</button>
                <button type="button" role="tab" aria-selected={mode === 'guest'} onClick={() => setMode('guest')}>Visitantes guest</button>
            </div>
            {mode === 'admin'
                ? <ManagedSessions session={session} onSessionEnded={onSessionEnded} />
                : <GuestSessions session={session} />}
        </div>
    );
}

function ManagedSessions({ session, onSessionEnded }: { session: AdminSession; onSessionEnded: () => void }) {
    const [page, setPage] = useState(1);
    const [searchDraft, setSearchDraft] = useState('');
    const [search, setSearch] = useState('');
    const queryClient = useQueryClient();
    const canSeeAll = session.permissions.includes('ADMIN_USERS_READ');
    const query = useQuery({
        queryKey: ['admin', 'managed-sessions', page, search],
        queryFn: () => listManagedAdminSessions({ page, pageSize: 25, search }),
    });
    const mutation = useMutation({
        mutationFn: ({ id }: { id: string; current: boolean }) => revokeManagedAdminSession(id),
        onSuccess: (_, variables) => {
            if (variables.current) {
                onSessionEnded();
                return;
            }
            void queryClient.invalidateQueries({ queryKey: ['admin', 'managed-sessions'] });
            void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
        },
    });
    const submit = (event: FormEvent) => {
        event.preventDefault();
        setPage(1);
        setSearch(searchDraft.trim());
    };
    const revoke = (id: string, current: boolean) => {
        const message = current
            ? 'Encerrar esta sessão atual? Você voltará para a tela de login.'
            : 'Encerrar esta sessão administrativa?';
        if (window.confirm(message)) mutation.mutate({ id, current });
    };
    return (
        <AdminPanel
            title={canSeeAll ? 'Sessões de todos os administradores' : 'Minhas sessões administrativas'}
            description="Sessões encerradas permanecem visíveis como evidência operacional até a retenção."
        >
            <form className="admin-toolbar" onSubmit={submit}>
                <label className="admin-search-field"><span className="sr-only">Buscar sessão administrativa</span><Search aria-hidden="true" /><input className={adminInputClass} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder={canSeeAll ? 'Nome, e-mail ou identificador' : 'Identificador da sessão'} maxLength={100} /></label>
                <Button type="submit" variant="secondary">Buscar</Button>
            </form>
            {mutation.error ? <AdminFeedback message={getAdminErrorMessage(mutation.error)} /> : null}
            {query.isLoading ? <AdminLoading /> : query.error ? <AdminFeedback message={getAdminErrorMessage(query.error)} /> : query.data?.sessions.length ? (
                <>
                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead><tr><th>Administrador</th><th>Sessão</th><th>Última atividade</th><th>Estado</th><th><span className="sr-only">Ações</span></th></tr></thead>
                            <tbody>{query.data.sessions.map((item) => {
                                const expired = new Date(item.expiresAt) <= new Date();
                                const active = !item.revokedAt && !expired;
                                return (
                                    <tr key={item.id}>
                                        <td><strong>{item.user.displayName}</strong><small>{item.user.email}</small></td>
                                        <td><code>{item.id.slice(0, 12)}…</code><small>{item.current ? 'Esta sessão' : `Criada em ${formatAdminDate(item.createdAt)}`}</small></td>
                                        <td>{formatAdminDate(item.lastSeenAt)}</td>
                                        <td><AdminStatus tone={active ? 'good' : 'neutral'}>{active ? (item.current ? 'Atual' : 'Ativa') : item.revokedAt ? 'Encerrada' : 'Expirada'}</AdminStatus></td>
                                        <td>{active ? <Button size="sm" variant="ghost" onClick={() => revoke(item.id, item.current)}><ShieldX className="mr-2 h-4 w-4" aria-hidden="true" /> Encerrar</Button> : null}</td>
                                    </tr>
                                );
                            })}</tbody>
                        </table>
                    </div>
                    <AdminPagination {...query.data.meta} onChange={setPage} />
                </>
            ) : <AdminEmpty title="Nenhuma sessão administrativa" description="Não há sessões que correspondam ao filtro." />}
        </AdminPanel>
    );
}

function GuestSessions({ session }: { session: AdminSession }) {
    const [page, setPage] = useState(1);
    const [searchDraft, setSearchDraft] = useState('');
    const [search, setSearch] = useState('');
    const queryClient = useQueryClient();
    const canWrite = session.permissions.includes('SESSIONS_WRITE');
    const query = useQuery({
        queryKey: ['admin', 'guest-sessions', page, search],
        queryFn: () => listAdminGuestSessions({ page, pageSize: 25, search }),
    });
    const mutation = useMutation({
        mutationFn: revokeAdminGuestSession,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['admin', 'guest-sessions'] });
            void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
        },
    });
    const submit = (event: FormEvent) => {
        event.preventDefault();
        setPage(1);
        setSearch(searchDraft.trim());
    };
    return (
        <AdminPanel title="Sessões guest" description="Identidades anônimas usadas nas salas, sem exibição do token de autenticação.">
            <form className="admin-toolbar" onSubmit={submit}>
                <label className="admin-search-field"><span className="sr-only">Buscar pelo início do ID</span><Search aria-hidden="true" /><input className={adminInputClass} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Início do identificador" maxLength={100} /></label>
                <Button type="submit" variant="secondary">Buscar</Button>
            </form>
            {mutation.error ? <AdminFeedback message={getAdminErrorMessage(mutation.error)} /> : null}
            {query.isLoading ? <AdminLoading /> : query.error ? <AdminFeedback message={getAdminErrorMessage(query.error)} /> : query.data?.sessions.length ? (
                <>
                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead><tr><th>Identificador</th><th>Última atividade</th><th>Expiração</th><th>Salas ativas</th><th><span className="sr-only">Ações</span></th></tr></thead>
                            <tbody>{query.data.sessions.map((item) => {
                                const active = new Date(item.expiresAt) > new Date();
                                return (
                                    <tr key={item.id}>
                                        <td><code>{item.id.slice(0, 12)}…</code><small>Criada em {formatAdminDate(item.createdAt)}</small></td>
                                        <td>{formatAdminDate(item.lastSeenAt)}</td>
                                        <td><AdminStatus tone={active ? 'good' : 'neutral'}>{active ? formatAdminDate(item.expiresAt) : 'Expirada'}</AdminStatus></td>
                                        <td>{item.activeRoomCount}</td>
                                        <td>{canWrite && active ? <Button size="sm" variant="ghost" onClick={() => { if (window.confirm('Revogar esta sessão guest?')) mutation.mutate(item.id); }}><ShieldX className="mr-2 h-4 w-4" aria-hidden="true" /> Revogar</Button> : null}</td>
                                    </tr>
                                );
                            })}</tbody>
                        </table>
                    </div>
                    <AdminPagination {...query.data.meta} onChange={setPage} />
                </>
            ) : <AdminEmpty title="Nenhuma sessão guest" description="Não há sessões que correspondam ao filtro." />}
        </AdminPanel>
    );
}
