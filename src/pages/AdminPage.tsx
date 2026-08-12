import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AdminSession } from '@shared/index';
import { AdminApiError, getAdminSession, logoutAdmin } from '@/services/adminApi';
import { AdminAuditPanel } from '@/components/admin/AdminAuditPanel';
import { AdminCatalogPanel } from '@/components/admin/AdminCatalogPanel';
import { AdminDashboardPanel } from '@/components/admin/AdminDashboardPanel';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { AdminReferencesPanel } from '@/components/admin/AdminReferencesPanel';
import { AdminRoomsPanel } from '@/components/admin/AdminRoomsPanel';
import { AdminSessionsPanel } from '@/components/admin/AdminSessionsPanel';
import { AdminShell, type AdminSection } from '@/components/admin/AdminShell';
import { AdminSystemPanel } from '@/components/admin/AdminSystemPanel';
import { AdminUsersPanel } from '@/components/admin/AdminUsersPanel';
import { AdminFeedback, AdminLoading } from '@/components/admin/AdminPrimitives';

const sections = new Set<AdminSection>([
    'dashboard',
    'rooms',
    'catalog',
    'references',
    'sessions',
    'users',
    'audit',
    'system',
]);

export function AdminPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const requestedSection = location.pathname.split('/')[2] ?? 'dashboard';
    const section = sections.has(requestedSection as AdminSection)
        ? requestedSection as AdminSection
        : 'dashboard';
    const sessionQuery = useQuery({
        queryKey: ['admin', 'session'],
        queryFn: getAdminSession,
        retry: false,
        staleTime: 60_000,
    });
    const logoutMutation = useMutation({
        mutationFn: logoutAdmin,
        onSettled: () => {
            queryClient.removeQueries({ queryKey: ['admin'] });
            navigate('/admin', { replace: true });
        },
    });

    useEffect(() => {
        document.documentElement.dataset.admin = 'true';
        const previousTitle = document.title;
        const existingRobots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
        const previousRobots = existingRobots?.content;
        const robots = existingRobots ?? document.createElement('meta');
        if (!existingRobots) {
            robots.name = 'robots';
            document.head.append(robots);
        }
        robots.content = 'noindex, nofollow, noarchive';
        document.title = 'Administração | AMIGOS DB';
        return () => {
            delete document.documentElement.dataset.admin;
            document.title = previousTitle;
            if (existingRobots) robots.content = previousRobots ?? '';
            else robots.remove();
        };
    }, []);

    useEffect(() => {
        if (requestedSection !== section) navigate(`/admin/${section}`, { replace: true });
    }, [navigate, requestedSection, section]);

    useEffect(() => {
        if (sessionQuery.data && !isAllowed(section, sessionQuery.data.permissions)) {
            navigate('/admin/dashboard', { replace: true });
        }
    }, [navigate, section, sessionQuery.data]);

    if (sessionQuery.isLoading) {
        return <main className="admin-session-loading"><AdminLoading label="Verificando acesso administrativo…" /></main>;
    }

    if (sessionQuery.error) {
        if (sessionQuery.error instanceof AdminApiError && sessionQuery.error.status === 401) {
            return <AdminLogin onAuthenticated={() => void sessionQuery.refetch()} />;
        }
        return (
            <main className="admin-session-loading">
                <AdminFeedback message={sessionQuery.error instanceof Error ? sessionQuery.error.message : 'Não foi possível verificar a sessão.'} />
                <button type="button" className="admin-retry-button" onClick={() => void sessionQuery.refetch()}>Tentar novamente</button>
            </main>
        );
    }

    const session = sessionQuery.data;
    if (!session) return null;

    const allowedSection = isAllowed(section, session.permissions) ? section : 'dashboard';
    const changeSection = (next: AdminSection) => navigate(`/admin/${next}`);
    const endSession = () => {
        queryClient.removeQueries({ queryKey: ['admin'] });
        navigate('/admin', { replace: true });
        void sessionQuery.refetch();
    };

    return (
        <AdminShell
            session={session}
            section={allowedSection}
            onSectionChange={changeSection}
            onLogout={() => logoutMutation.mutate()}
        >
            {renderSection(allowedSection, session, changeSection, endSession)}
        </AdminShell>
    );
}

function renderSection(
    section: AdminSection,
    session: AdminSession,
    navigate: (section: AdminSection) => void,
    onSessionEnded: () => void
) {
    if (section === 'dashboard') return <AdminDashboardPanel onNavigate={navigate} />;
    if (section === 'rooms') return <AdminRoomsPanel session={session} />;
    if (section === 'catalog') return <AdminCatalogPanel session={session} />;
    if (section === 'references') return <AdminReferencesPanel session={session} />;
    if (section === 'sessions') return <AdminSessionsPanel session={session} onSessionEnded={onSessionEnded} />;
    if (section === 'users') return <AdminUsersPanel />;
    if (section === 'audit') return <AdminAuditPanel />;
    return <AdminSystemPanel session={session} onSessionEnded={onSessionEnded} />;
}

function isAllowed(section: AdminSection, permissions: readonly string[]): boolean {
    const permissionBySection: Partial<Record<AdminSection, string>> = {
        dashboard: 'DASHBOARD_READ',
        rooms: 'ROOMS_READ',
        catalog: 'DECISION_DATA_READ',
        references: 'REFERENCES_READ',
        sessions: 'SESSIONS_READ',
        users: 'ADMIN_USERS_READ',
        audit: 'AUDIT_READ',
    };
    const required = permissionBySection[section];
    return !required || permissions.includes(required);
}

export default AdminPage;
