import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DatabaseZap, KeyRound, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { AdminSession } from '@shared/index';
import { changeAdminPassword, runAdminRetention } from '@/services/adminApi';
import { AdminFeedback, AdminPageHeader, AdminPanel, adminInputClass, getAdminErrorMessage } from './AdminPrimitives';

export function AdminSystemPanel({ session, onSessionEnded }: { session: AdminSession; onSessionEnded: () => void }) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const queryClient = useQueryClient();
    const retention = useMutation({
        mutationFn: runAdminRetention,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['admin'] });
        },
    });
    const password = useMutation({
        mutationFn: () => changeAdminPassword(currentPassword, newPassword),
        onSuccess: onSessionEnded,
    });
    const submitPassword = (event: FormEvent) => {
        event.preventDefault();
        password.mutate();
    };
    return (
        <div className="admin-page">
            <AdminPageHeader eyebrow="Manutenção controlada" title="Sistema" description="Operações globais exigem confirmação e deixam evidência na auditoria." />
            <div className="admin-system-grid">
                {session.permissions.includes('RETENTION_RUN') ? <AdminPanel title="Retenção e purga" description="Remove salas, sessões guest e chaves de idempotência que já expiraram.">
                    <div className="admin-system-icon"><DatabaseZap aria-hidden="true" /></div>
                    <p>A operação é transacional e não remove sessões ainda ligadas a salas válidas.</p>
                    <label><span>Digite PURGAR para habilitar</span><input className={adminInputClass} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
                    <Button onClick={() => retention.mutate()} disabled={confirmation !== 'PURGAR'} isLoading={retention.isPending}>Executar retenção</Button>
                    {retention.data ? <AdminFeedback tone="success" message={`Concluído: ${retention.data.rooms} salas, ${retention.data.guestSessions} sessões guest, ${retention.data.adminSessions} sessões administrativas e ${retention.data.idempotencyKeys} chaves removidas.`} /> : null}
                    {retention.error ? <AdminFeedback message={getAdminErrorMessage(retention.error)} /> : null}
                </AdminPanel> : null}
                <AdminPanel title="Trocar minha senha" description="A troca encerra todas as suas sessões administrativas.">
                    <div className="admin-system-icon"><KeyRound aria-hidden="true" /></div>
                    <form className="admin-form" onSubmit={submitPassword}>
                        <label><span>Senha atual</span><input className={adminInputClass} type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required maxLength={128} autoComplete="current-password" /></label>
                        <label><span>Nova senha</span><input className={adminInputClass} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={12} maxLength={128} autoComplete="new-password" /></label>
                        <Button type="submit" variant="secondary" isLoading={password.isPending}>Trocar senha e sair</Button>
                        {password.error ? <AdminFeedback message={getAdminErrorMessage(password.error)} /> : null}
                    </form>
                </AdminPanel>
                <AdminPanel className="admin-system-note" title="Limites de segurança">
                    <ShieldAlert aria-hidden="true" />
                    <p>Segredos, tokens guest e hashes de sessão nunca são devolvidos por esta interface. Dados externos só podem virar verificados com fonte HTTPS e data de verificação.</p>
                </AdminPanel>
            </div>
        </div>
    );
}
