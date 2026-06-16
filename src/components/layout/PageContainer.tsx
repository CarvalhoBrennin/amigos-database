import { type ReactNode } from 'react';

interface PageContainerProps {
    children: ReactNode;
    ambientBackground?: 'default' | 'none';
}

export function PageContainer({
    children,
    ambientBackground = 'default',
}: PageContainerProps) {
    return (
        <div className="relative flex min-h-full flex-col bg-transparent">
            {ambientBackground === 'default' && (
                <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-20">
                    <div className="absolute inset-0 scanline" />
                </div>
            )}

            <main className="flex-1 relative z-10">
                {children}
            </main>
        </div>
    );
}
