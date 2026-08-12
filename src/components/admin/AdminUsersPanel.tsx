import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, Search, UserCog } from 'lucide-react';
import type { AdminRole, AdminUser } from '@shared/index';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { createAdminUser, listAdminUsers, updateAdminUser } from '@/services/adminApi';
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

export function AdminUsersPanel() {
    const [page, setPage] = useState(1);
    const [searchDraft, setSearchDraft] = useState('');
    const [search, setSearch] = useState('');
    const [role, setRole] = useState('');
    const [editing, setEditing] = useState<AdminUser | 'new' | null>(null);
    const query = useQuery({
        queryKey: ['admin', 'users', page, search, role],
        queryFn: () => listAdminUsers({ page, pageSize: 25, search, role: role ? role as AdminRole : undefined }),
    });
    const submit = (event: FormEvent) => {
        event.preventDefault();
        setPage(1);
        setSearch(searchDraft.trim());
    };

    return (
        <div className="admin-page">
            <AdminPageHeader
                eyebrow="Controle de acesso"
                title="Administradores"
                description="Crie contas individuais, aplique o menor privilégio e revogue acessos sem compartilhar senhas."
                actions={<Button onClick={() => setEditing('new')}><Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Novo administrador</Button>}
            />
            <AdminPanel>
                <form className="admin-toolbar" onSubmit={submit}>
                    <label className="admin-search-field"><span className="sr-only">Buscar administrador</span><Search aria-hidden="true" /><input className={adminInputClass} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Nome ou e-mail" /></label>
                    <select className={adminSelectClass} value={role} onChange={(event) => { setRole(event.target.value); setPage(1); }} aria-label="Filtrar por papel">
                        <option value="">Todos os papéis</option><option value="SUPER_ADMIN">Super administrador</option><option value="EDITOR">Editor</option><option value="VIEWER">Somente leitura</option>
                    </select>
                    <Button type="submit" variant="secondary">Buscar</Button>
                </form>
                {query.isLoading ? <AdminLoading /> : query.error ? <AdminFeedback message={getAdminErrorMessage(query.error)} /> : query.data?.users.length ? (
                    <>
                        <div className="admin-table-wrap">
                            <table className="admin-table">
                                <thead><tr><th>Administrador</th><th>Papel</th><th>Estado</th><th>Último acesso</th><th><span className="sr-only">Ações</span></th></tr></thead>
                                <tbody>{query.data.users.map((user) => (
                                    <tr key={user.id}>
                                        <td><strong>{user.displayName}</strong><small>{user.email}</small></td>
                                        <td>{roleLabel(user.role)}</td>
                                        <td><AdminStatus tone={user.active ? (user.lockedUntil ? 'warning' : 'good') : 'danger'}>{user.active ? (user.lockedUntil ? 'Bloqueado' : 'Ativo') : 'Desativado'}</AdminStatus></td>
                                        <td>{formatAdminDate(user.lastLoginAt)}</td>
                                        <td><Button size="sm" variant="ghost" onClick={() => setEditing(user)}><UserCog className="mr-2 h-4 w-4" aria-hidden="true" /> Editar</Button></td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                        <AdminPagination {...query.data.meta} onChange={setPage} />
                    </>
                ) : <AdminEmpty title="Nenhum administrador" description="Crie uma conta ou ajuste a busca." />}
            </AdminPanel>
            <UserFormModal value={editing} onClose={() => setEditing(null)} />
        </div>
    );
}

function UserFormModal({ value, onClose }: { value: AdminUser | 'new' | null; onClose: () => void }) {
    const editing = value && value !== 'new' ? value : null;
    const [email, setEmail] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<AdminRole>('VIEWER');
    const [active, setActive] = useState(true);
    const queryClient = useQueryClient();

    useEffect(() => {
        setEmail(editing?.email ?? '');
        setDisplayName(editing?.displayName ?? '');
        setPassword('');
        setRole(editing?.role ?? 'VIEWER');
        setActive(editing?.active ?? true);
    }, [editing, value]);

    const mutation = useMutation({
        mutationFn: () => editing
            ? updateAdminUser(editing.id, {
                displayName,
                role,
                active,
                ...(password ? { newPassword: password } : {}),
            })
            : createAdminUser({ email, displayName, password, role }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
            onClose();
        },
    });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        mutation.mutate();
    };

    return (
        <Modal isOpen={Boolean(value)} onClose={onClose} ariaLabel={editing ? 'Editar administrador' : 'Criar administrador'}>
            <form className="admin-modal admin-form" onSubmit={submit}>
                <header className="admin-modal__header"><div><p className="admin-eyebrow">Controle de acesso</p><h2>{editing ? 'Editar administrador' : 'Nova conta administrativa'}</h2></div><KeyRound aria-hidden="true" /></header>
                <div className="admin-form-grid">
                    <label><span>Nome de exibição</span><input className={adminInputClass} value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={80} required /></label>
                    <label><span>E-mail</span><input className={adminInputClass} type="email" value={editing?.email ?? email} onChange={(event) => setEmail(event.target.value)} disabled={Boolean(editing)} maxLength={254} required /></label>
                    <label><span>Papel</span><select className={adminSelectClass} value={role} onChange={(event) => setRole(event.target.value as AdminRole)}><option value="VIEWER">Somente leitura</option><option value="EDITOR">Editor</option><option value="SUPER_ADMIN">Super administrador</option></select></label>
                    <label><span>{editing ? 'Nova senha (opcional)' : 'Senha inicial'}</span><input className={adminInputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={editing ? undefined : 12} maxLength={128} required={!editing} autoComplete="new-password" /></label>
                    {editing ? <label className="admin-checkbox"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span>Conta ativa</span></label> : null}
                </div>
                {mutation.error ? <AdminFeedback message={getAdminErrorMessage(mutation.error)} /> : null}
                <footer className="admin-form-actions"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" isLoading={mutation.isPending}>{editing ? 'Salvar alterações' : 'Criar administrador'}</Button></footer>
            </form>
        </Modal>
    );
}

function roleLabel(role: AdminRole): string {
    return role === 'SUPER_ADMIN' ? 'Super administrador' : role === 'EDITOR' ? 'Editor' : 'Somente leitura';
}
