import { LoadingState } from '@/components/ui/loading/LoadingState';

export function ModalLoadingFallback() {
    return (
        <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden min-h-[320px]">
            <LoadingState layout="centered" size="lg" className="min-h-[320px]" />
        </div>
    );
}
