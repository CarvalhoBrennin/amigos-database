import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { listAdminAudit } from '@/services/adminApi';
import { AdminEmpty, AdminFeedback, AdminLoading, AdminPageHeader, AdminPagination, AdminPanel, adminInputClass, formatAdminDate, getAdminErrorMessage } from './AdminPrimitives';

export function AdminAuditPanel() {
    const [page, setPage] = useState(1);
    const [actionDraft, setActionDraft] = useState('');
    const [entityDraft, setEntityDraft] = useState('');
    const [action, setAction] = useState('');
    const [entityType, setEntityType] = useState('');
    const query = useQuery({
        queryKey: ['admin', 'audit', page, action, entityType],
        queryFn: () => listAdminAudit({ page, pageSize: 25, action, entityType }),
    });
    const submit = (event: FormEvent) => {
        event.preventDefault();
        setPage(1);
        setAction(actionDraft.trim());
        setEntityType(entityDraft.trim());
    };
    return (
        <div className="admin-page">
            <AdminPageHeader eyebrow="Trilha imutável" title="Auditoria" description="Cada mutação administrativa registra ator, alvo, instante e request ID sem guardar segredos." />
            <AdminPanel>
                <form className="admin-toolbar" onSubmit={submit}>
                    <label className="admin-search-field"><Search aria-hidden="true" /><span className="sr-only">Filtrar ação</span><input className={adminInputClass} value={actionDraft} onChange={(event) => setActionDraft(event.target.value)} placeholder="Ação exata" maxLength={80} /></label>
                    <input className={adminInputClass} value={entityDraft} onChange={(event) => setEntityDraft(event.target.value)} placeholder="Tipo de entidade" maxLength={80} aria-label="Tipo de entidade" />
                    <Button type="submit" variant="secondary">Filtrar</Button>
                </form>
                {query.isLoading ? <AdminLoading /> : query.error ? <AdminFeedback message={getAdminErrorMessage(query.error)} /> : query.data?.entries.length ? (
                    <>
                        <div className="admin-audit-list">
                            {query.data.entries.map((entry) => (
                                <article key={entry.id}>
                                    <div className="admin-audit-list__rail" aria-hidden="true" />
                                    <div className="admin-audit-list__top"><strong>{entry.action}</strong><time>{formatAdminDate(entry.createdAt)}</time></div>
                                    <p>{entry.actor ? `${entry.actor.displayName} · ${entry.actor.email}` : 'Ator removido'} → {entry.entityType}{entry.entityId ? ` / ${entry.entityId}` : ''}</p>
                                    <details><summary>Metadados e request ID</summary><code>{entry.requestId}</code><pre>{JSON.stringify(entry.metadata, null, 2)}</pre></details>
                                </article>
                            ))}
                        </div>
                        <AdminPagination {...query.data.meta} onChange={setPage} />
                    </>
                ) : <AdminEmpty title="Nenhum evento" description="Não há ações compatíveis com os filtros." />}
            </AdminPanel>
        </div>
    );
}
