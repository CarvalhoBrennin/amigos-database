import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';

type PaginationItem = number | 'ellipsis';

function buildPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    if (currentPage <= 4) {
        return [1, 2, 3, 4, 5, 'ellipsis', totalPages];
    }

    if (currentPage >= totalPages - 3) {
        return [1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages];
}

interface PaginationControlsProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    className?: string;
}

export function PaginationControls({
    currentPage,
    totalPages,
    onPageChange,
    className = '',
}: PaginationControlsProps) {
    const { t } = useTranslation();

    if (totalPages <= 1) {
        return null;
    }

    const paginationItems = buildPaginationItems(currentPage, totalPages);

    return (
        <nav aria-label={t('pagination.label')} className={`flex justify-center items-center gap-2 mt-8 ${className}`.trim()}>
            <Button
                variant="secondary"
                size="sm"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                aria-label={t('pagination.previous')}
                className="px-2"
            >
                <ChevronLeft className="h-5 w-5" />
            </Button>

            {paginationItems.map((item, index) =>
                item === 'ellipsis' ? (
                    <span key={`ellipsis-${index}`} className="px-2 text-stone-500" aria-hidden="true">
                        <MoreHorizontal className="h-4 w-4" />
                    </span>
                ) : (
                    <Button
                        key={item}
                        variant={currentPage === item ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => onPageChange(item)}
                        className={`w-8 h-8 p-0 ${currentPage === item ? 'font-bold' : ''}`}
                        aria-current={currentPage === item ? 'page' : undefined}
                    >
                        {item}
                    </Button>
                )
            )}

            <Button
                variant="secondary"
                size="sm"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                aria-label={t('pagination.next')}
                className="px-2"
            >
                <ChevronRight className="h-5 w-5" />
            </Button>
        </nav>
    );
}