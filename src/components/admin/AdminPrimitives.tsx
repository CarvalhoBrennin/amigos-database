import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

export const adminInputClass = 'admin-input';
export const adminSelectClass = 'admin-input admin-select';
export const adminTextareaClass = 'admin-input admin-textarea';

export function AdminPageHeader({ eyebrow, title, description, actions }: {
    eyebrow: string;
    title: string;
    description: string;
    actions?: ReactNode;
}) {
    return (
        <header className="admin-page-header">
            <div>
                <p className="admin-eyebrow">{eyebrow}</p>
                <h1>{title}</h1>
                <p>{description}</p>
            </div>
            {actions ? <div className="admin-page-header__actions">{actions}</div> : null}
        </header>
    );
}

export function AdminPanel({ children, className, title, description, actions }: {
    children: ReactNode;
    className?: string;
    title?: string;
    description?: string;
    actions?: ReactNode;
}) {
    return (
        <section className={cn('admin-panel', className)}>
            {title || description || actions ? (
                <header className="admin-panel__header">
                    <div>
                        {title ? <h2>{title}</h2> : null}
                        {description ? <p>{description}</p> : null}
                    </div>
                    {actions ? <div className="admin-panel__actions">{actions}</div> : null}
                </header>
            ) : null}
            {children}
        </section>
    );
}

export function AdminMetric({ label, value, detail, tone = 'default' }: {
    label: string;
    value: string | number;
    detail?: string;
    tone?: 'default' | 'good' | 'warning' | 'danger';
}) {
    return (
        <article className="admin-metric" data-tone={tone}>
            <span>{label}</span>
            <strong>{value}</strong>
            {detail ? <small>{detail}</small> : null}
        </article>
    );
}

export function AdminStatus({ children, tone = 'neutral' }: {
    children: ReactNode;
    tone?: 'neutral' | 'good' | 'warning' | 'danger' | 'info';
}) {
    return <span className="admin-status" data-tone={tone}>{children}</span>;
}

export function AdminFeedback({ message, tone = 'error' }: {
    message: string;
    tone?: 'error' | 'success';
}) {
    return (
        <div className="admin-feedback" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
            {tone === 'error' ? <AlertTriangle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
            <span>{message}</span>
        </div>
    );
}

export function AdminLoading({ label = 'Carregando dados…' }: { label?: string }) {
    return (
        <div className="admin-loading" role="status">
            <LoaderCircle className="animate-spin" aria-hidden="true" />
            <span>{label}</span>
        </div>
    );
}

export function AdminEmpty({ title, description }: { title: string; description: string }) {
    return (
        <div className="admin-empty">
            <strong>{title}</strong>
            <p>{description}</p>
        </div>
    );
}

export function AdminPagination({ page, totalPages, total, onChange }: {
    page: number;
    totalPages: number;
    total: number;
    onChange: (page: number) => void;
}) {
    return (
        <nav className="admin-pagination" aria-label="Paginação">
            <span>{total} registros</span>
            <div>
                <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Página anterior">
                    <ChevronLeft aria-hidden="true" />
                </button>
                <strong>{totalPages === 0 ? 0 : page} / {totalPages}</strong>
                <button type="button" onClick={() => onChange(page + 1)} disabled={totalPages === 0 || page >= totalPages} aria-label="Próxima página">
                    <ChevronRight aria-hidden="true" />
                </button>
            </div>
        </nav>
    );
}

export function formatAdminDate(value: string | null): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(new Date(value));
}

export function getAdminErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return 'Ocorreu um erro inesperado.';
}
