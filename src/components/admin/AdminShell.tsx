import type { ReactNode } from 'react';
import {
    Activity,
    BookOpenCheck,
    Boxes,
    Database,
    DoorOpen,
    Gamepad2,
    LayoutDashboard,
    LogOut,
    Menu,
    ScrollText,
    Settings2,
    ShieldCheck,
    Users,
    X,
} from 'lucide-react';
import { useState } from 'react';
import type { AdminPermission, AdminSession } from '@shared/index';
import { cn } from '@/lib/cn';

export type AdminSection = 'dashboard' | 'rooms' | 'catalog' | 'references' | 'sessions' | 'users' | 'audit' | 'system';

const navItems: Array<{
    id: AdminSection;
    label: string;
    icon: typeof LayoutDashboard;
    permission?: AdminPermission;
}> = [
    { id: 'dashboard', label: 'Visão geral', icon: LayoutDashboard, permission: 'DASHBOARD_READ' },
    { id: 'rooms', label: 'Salas', icon: DoorOpen, permission: 'ROOMS_READ' },
    { id: 'catalog', label: 'Dados de jogos', icon: Gamepad2, permission: 'DECISION_DATA_READ' },
    { id: 'references', label: 'Referências', icon: Boxes, permission: 'REFERENCES_READ' },
    { id: 'sessions', label: 'Sessões', icon: Activity, permission: 'SESSIONS_READ' },
    { id: 'users', label: 'Administradores', icon: Users, permission: 'ADMIN_USERS_READ' },
    { id: 'audit', label: 'Auditoria', icon: ScrollText, permission: 'AUDIT_READ' },
    { id: 'system', label: 'Conta e sistema', icon: Settings2 },
];

export function AdminShell({ session, section, onSectionChange, onLogout, children }: {
    session: AdminSession;
    section: AdminSection;
    onSectionChange: (section: AdminSection) => void;
    onLogout: () => void;
    children: ReactNode;
}) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const visibleItems = navItems.filter((item) => !item.permission || session.permissions.includes(item.permission));

    const changeSection = (next: AdminSection) => {
        onSectionChange(next);
        setMobileOpen(false);
    };

    return (
        <div className="admin-root">
            <a href="#admin-content" className="admin-skip-link">Pular para o conteúdo</a>
            <header className="admin-mobile-header">
                <button type="button" onClick={() => setMobileOpen((open) => !open)} aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}>
                    {mobileOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
                </button>
                <AdminBrand compact />
                <ShieldCheck aria-hidden="true" />
            </header>
            <aside className={cn('admin-sidebar', mobileOpen && 'admin-sidebar--open')}>
                <AdminBrand />
                <div className="admin-sidebar__scope">
                    <Database aria-hidden="true" />
                    <div>
                        <span>Console operacional</span>
                        <strong>Ambiente atual</strong>
                    </div>
                </div>
                <nav aria-label="Navegação administrativa">
                    {visibleItems.map((item) => {
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                className={section === item.id ? 'admin-nav-item admin-nav-item--active' : 'admin-nav-item'}
                                onClick={() => changeSection(item.id)}
                                aria-current={section === item.id ? 'page' : undefined}
                            >
                                <Icon aria-hidden="true" />
                                <span>{item.label}</span>
                            </button>
                        );
                    })}
                </nav>
                <div className="admin-sidebar__user">
                    <div className="admin-avatar" aria-hidden="true">{initials(session.user.displayName)}</div>
                    <div>
                        <strong>{session.user.displayName}</strong>
                        <span>{roleLabel(session.user.role)}</span>
                    </div>
                    <button type="button" onClick={onLogout} aria-label="Sair do painel administrativo">
                        <LogOut aria-hidden="true" />
                    </button>
                </div>
            </aside>
            {mobileOpen ? <button type="button" className="admin-sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="Fechar menu" /> : null}
            <main id="admin-content" className="admin-main" tabIndex={-1}>
                {children}
            </main>
        </div>
    );
}

function AdminBrand({ compact = false }: { compact?: boolean }) {
    return (
        <div className={compact ? 'admin-brand admin-brand--compact' : 'admin-brand'}>
            <span className="admin-brand__mark"><BookOpenCheck aria-hidden="true" /></span>
            {!compact ? (
                <div>
                    <strong>AMIGOS DB</strong>
                    <span>Administração</span>
                </div>
            ) : null}
        </div>
    );
}

function initials(name: string): string {
    return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

function roleLabel(role: AdminSession['user']['role']): string {
    if (role === 'SUPER_ADMIN') return 'Super administrador';
    if (role === 'EDITOR') return 'Editor';
    return 'Somente leitura';
}
