import { useState, type FormEvent } from 'react';
import { BookOpenCheck, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { AdminFeedback, adminInputClass, getAdminErrorMessage } from './AdminPrimitives';
import { loginAdmin } from '@/services/adminApi';

export function AdminLogin({ onAuthenticated }: { onAuthenticated: () => void }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const mutation = useMutation({
        mutationFn: () => loginAdmin(email, password),
        onSuccess: onAuthenticated,
    });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (!mutation.isPending) mutation.mutate();
    };

    return (
        <main className="admin-login">
            <section className="admin-login__story" aria-label="AMIGOS Database">
                <div className="admin-login__brand">
                    <BookOpenCheck aria-hidden="true" />
                    <span>AMIGOS DB</span>
                </div>
                <div className="admin-login__story-copy">
                    <p className="admin-eyebrow">Console operacional</p>
                    <h1>O banco vivo por trás de cada decisão.</h1>
                    <p>Salas, compatibilidade, assinaturas, preços e auditoria em uma superfície protegida.</p>
                </div>
                <div className="admin-login__signal">
                    <ShieldCheck aria-hidden="true" />
                    <span>Cookie HttpOnly · CSRF dedicado · trilha imutável</span>
                </div>
            </section>
            <section className="admin-login__form-wrap">
                <form className="admin-login__form" onSubmit={submit}>
                    <div className="admin-login__lock"><LockKeyhole aria-hidden="true" /></div>
                    <p className="admin-eyebrow">Acesso restrito</p>
                    <h2>Entrar na administração</h2>
                    <p>Use uma conta criada pelo responsável da instalação.</p>
                    <label>
                        <span>E-mail</span>
                        <input
                            className={adminInputClass}
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            autoComplete="username"
                            required
                            maxLength={254}
                        />
                    </label>
                    <label>
                        <span>Senha</span>
                        <span className="admin-password-field">
                            <input
                                className={adminInputClass}
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                autoComplete="current-password"
                                required
                                maxLength={128}
                            />
                            <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                                {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                            </button>
                        </span>
                    </label>
                    {mutation.error ? <AdminFeedback message={getAdminErrorMessage(mutation.error)} /> : null}
                    <Button type="submit" size="lg" isLoading={mutation.isPending} className="w-full">
                        Acessar painel
                    </Button>
                    <small>Tentativas repetidas bloqueiam temporariamente a conta.</small>
                </form>
            </section>
        </main>
    );
}
