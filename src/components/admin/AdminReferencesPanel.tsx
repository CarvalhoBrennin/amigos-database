import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { AdminSession } from '@shared/index';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { deleteAdminReference, getAdminReferences, saveAdminReference } from '@/services/adminApi';
import {
    AdminEmpty,
    AdminFeedback,
    AdminLoading,
    AdminPageHeader,
    AdminPanel,
    AdminStatus,
    adminInputClass,
    adminSelectClass,
    formatAdminDate,
    getAdminErrorMessage,
} from './AdminPrimitives';

type ReferenceData = Awaited<ReturnType<typeof getAdminReferences>>;
type ReferenceKind = 'platforms' | 'services' | 'plans' | 'plan-regions';
type ReferenceItem = ReferenceData['platforms'][number] | ReferenceData['services'][number] | ReferenceData['plans'][number] | ReferenceData['planRegions'][number];

const tabs: Array<{ id: ReferenceKind; label: string }> = [
    { id: 'platforms', label: 'Plataformas' },
    { id: 'services', label: 'Serviços' },
    { id: 'plans', label: 'Planos' },
    { id: 'plan-regions', label: 'Regiões e capacidades' },
];

export function AdminReferencesPanel({ session }: { session: AdminSession }) {
    const [kind, setKind] = useState<ReferenceKind>('platforms');
    const [editing, setEditing] = useState<ReferenceItem | 'new' | null>(null);
    const queryClient = useQueryClient();
    const canWrite = session.permissions.includes('REFERENCES_WRITE');
    const query = useQuery({ queryKey: ['admin', 'references'], queryFn: getAdminReferences });
    const deleteMutation = useMutation({
        mutationFn: ({ resource, id }: { resource: ReferenceKind; id: string }) => deleteAdminReference(resource, id),
        onSuccess: (data) => queryClient.setQueryData(['admin', 'references'], data),
    });
    const remove = (item: ReferenceItem) => {
        const id = referenceId(kind, item);
        if (window.confirm('Excluir esta referência? Se estiver em uso, a API impedirá a operação.')) {
            deleteMutation.mutate({ resource: kind, id });
        }
    };

    return (
        <div className="admin-page">
            <AdminPageHeader
                eyebrow="Taxonomia operacional"
                title="Referências"
                description="Plataformas e assinaturas são dados versionáveis, nunca enums presos ao frontend."
                actions={canWrite ? <Button onClick={() => setEditing('new')}><Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Nova referência</Button> : undefined}
            />
            <AdminPanel>
                <div className="admin-tabs" role="tablist" aria-label="Tipos de referência">
                    {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={kind === tab.id} onClick={() => setKind(tab.id)}>{tab.label}</button>)}
                </div>
                {deleteMutation.error ? <AdminFeedback message={getAdminErrorMessage(deleteMutation.error)} /> : null}
                {query.isLoading ? <AdminLoading /> : query.error ? <AdminFeedback message={getAdminErrorMessage(query.error)} /> : query.data ? (
                    <ReferenceTable kind={kind} data={query.data} canWrite={canWrite} onEdit={setEditing} onDelete={remove} />
                ) : null}
            </AdminPanel>
            <ReferenceFormModal kind={kind} value={editing} data={query.data ?? null} onClose={() => setEditing(null)} />
        </div>
    );
}

function ReferenceTable({ kind, data, canWrite, onEdit, onDelete }: {
    kind: ReferenceKind;
    data: ReferenceData;
    canWrite: boolean;
    onEdit: (item: ReferenceItem) => void;
    onDelete: (item: ReferenceItem) => void;
}) {
    const items = kind === 'platforms' ? data.platforms : kind === 'services' ? data.services : kind === 'plans' ? data.plans : data.planRegions;
    if (items.length === 0) return <AdminEmpty title="Nenhuma referência" description="Cadastre o primeiro item deste grupo." />;
    return (
        <div className="admin-table-wrap">
            <table className="admin-table">
                <thead><tr><th>Código / nome</th><th>Escopo</th><th>Estado</th><th>Detalhes</th><th><span className="sr-only">Ações</span></th></tr></thead>
                <tbody>{items.map((item) => {
                    const id = referenceId(kind, item as ReferenceItem);
                    const view = referenceView(kind, item as ReferenceItem);
                    return (
                        <tr key={id}>
                            <td><strong>{view.title}</strong><small>{view.code}</small></td>
                            <td>{view.scope}</td>
                            <td><AdminStatus tone={view.active ? 'good' : 'neutral'}>{view.active ? 'Ativo' : 'Inativo'}</AdminStatus></td>
                            <td>{view.detail}</td>
                            <td>{canWrite ? <span className="admin-row-actions"><Button size="sm" variant="ghost" onClick={() => onEdit(item as ReferenceItem)}><Pencil className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Editar</span></Button><Button size="sm" variant="ghost" onClick={() => onDelete(item as ReferenceItem)}><Trash2 className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Excluir</span></Button></span> : null}</td>
                        </tr>
                    );
                })}</tbody>
            </table>
        </div>
    );
}

function ReferenceFormModal({ kind, value, data, onClose }: {
    kind: ReferenceKind;
    value: ReferenceItem | 'new' | null;
    data: ReferenceData | null;
    onClose: () => void;
}) {
    const editing = value && value !== 'new' ? value : null;
    const [form, setForm] = useState<Record<string, string | number | boolean>>({});
    const queryClient = useQueryClient();
    useEffect(() => {
        setForm(referenceFormDefaults(kind, editing));
    }, [kind, editing, value]);
    const mutation = useMutation({
        mutationFn: () => saveAdminReference(kind, referencePayload(kind, form), editing ? referenceId(kind, editing) : undefined),
        onSuccess: (result) => {
            queryClient.setQueryData(['admin', 'references'], result);
            onClose();
        },
    });
    const set = (key: string, value: string | number | boolean) => setForm((current) => ({ ...current, [key]: value }));
    const submit = (event: FormEvent) => {
        event.preventDefault();
        mutation.mutate();
    };
    return (
        <Modal isOpen={Boolean(value)} onClose={onClose} ariaLabel="Editar referência" size="wide">
            <form className="admin-modal admin-form" onSubmit={submit}>
                <header className="admin-modal__header"><div><p className="admin-eyebrow">{tabs.find((tab) => tab.id === kind)?.label}</p><h2>{editing ? 'Editar referência' : 'Nova referência'}</h2></div></header>
                {kind === 'platforms' ? <PlatformFields form={form} set={set} codeLocked={Boolean(editing)} /> : null}
                {kind === 'services' ? <ServiceFields form={form} set={set} /> : null}
                {kind === 'plans' ? <PlanFields form={form} set={set} data={data} /> : null}
                {kind === 'plan-regions' ? <PlanRegionFields form={form} set={set} data={data} /> : null}
                {mutation.error ? <AdminFeedback message={getAdminErrorMessage(mutation.error)} /> : null}
                <footer className="admin-form-actions"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" isLoading={mutation.isPending}>Salvar referência</Button></footer>
            </form>
        </Modal>
    );
}

type SetField = (key: string, value: string | number | boolean) => void;

function PlatformFields({ form, set, codeLocked }: { form: Record<string, string | number | boolean>; set: SetField; codeLocked: boolean }) {
    return <div className="admin-form-grid"><TextField label="Código" name="code" form={form} set={set} disabled={codeLocked} /><label><span>Família</span><select className={adminSelectClass} value={String(form.family ?? 'PC')} onChange={(event) => set('family', event.target.value)}>{['PC', 'XBOX', 'PLAYSTATION', 'NINTENDO', 'MOBILE', 'BROWSER'].map((family) => <option key={family}>{family}</option>)}</select></label><TextField label="Nome exibido" name="displayName" form={form} set={set} /><NumberField label="Ordem" name="sortOrder" form={form} set={set} /><ActiveField form={form} set={set} /></div>;
}

function ServiceFields({ form, set }: { form: Record<string, string | number | boolean>; set: SetField }) {
    return <div className="admin-form-grid"><TextField label="Código" name="code" form={form} set={set} /><TextField label="Nome exibido" name="displayName" form={form} set={set} /><TextField label="Publicadora" name="publisher" form={form} set={set} /><ActiveField form={form} set={set} /></div>;
}

function PlanFields({ form, set, data }: { form: Record<string, string | number | boolean>; set: SetField; data: ReferenceData | null }) {
    return <div className="admin-form-grid"><label><span>Serviço</span><select className={adminSelectClass} value={String(form.serviceId ?? '')} onChange={(event) => set('serviceId', event.target.value)} required><option value="">Selecione</option>{data?.services.map((service) => <option key={service.id} value={service.id}>{service.displayName}</option>)}</select></label><TextField label="Código" name="code" form={form} set={set} /><TextField label="Nome exibido" name="displayName" form={form} set={set} /><NumberField label="Ordem" name="sortOrder" form={form} set={set} /><ActiveField form={form} set={set} /></div>;
}

function PlanRegionFields({ form, set, data }: { form: Record<string, string | number | boolean>; set: SetField; data: ReferenceData | null }) {
    return <div className="admin-form-grid"><label><span>Plano</span><select className={adminSelectClass} value={String(form.planId ?? '')} onChange={(event) => set('planId', event.target.value)} required><option value="">Selecione</option>{data?.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.displayName}</option>)}</select></label><TextField label="Região" name="regionCode" form={form} set={set} /><TextField label="Fonte HTTPS" name="sourceUrl" form={form} set={set} required={false} inputType="url" /><DateTimeField label="Válido desde" name="validFrom" form={form} set={set} /><DateTimeField label="Válido até" name="validUntil" form={form} set={set} /><DateTimeField label="Verificado em" name="lastVerifiedAt" form={form} set={set} /><ActiveField form={form} set={set} /><label className="admin-checkbox"><input type="checkbox" checked={Boolean(form.gameCatalogDownload)} onChange={(event) => set('gameCatalogDownload', event.target.checked)} /><span>Catálogo para download</span></label><label className="admin-checkbox"><input type="checkbox" checked={Boolean(form.onlineMultiplayer)} onChange={(event) => set('onlineMultiplayer', event.target.checked)} /><span>Multiplayer online</span></label><label className="admin-checkbox"><input type="checkbox" checked={Boolean(form.monthlyClaimedGames)} onChange={(event) => set('monthlyClaimedGames', event.target.checked)} /><span>Jogos mensais resgatáveis</span></label><label className="admin-checkbox"><input type="checkbox" checked={Boolean(form.cloudStreaming)} onChange={(event) => set('cloudStreaming', event.target.checked)} /><span>Cloud streaming</span></label></div>;
}

function TextField({ label, name, form, set, disabled = false, required = true, inputType = 'text' }: { label: string; name: string; form: Record<string, string | number | boolean>; set: SetField; disabled?: boolean; required?: boolean; inputType?: 'text' | 'url' }) {
    return <label><span>{label}</span><input className={adminInputClass} type={inputType} value={String(form[name] ?? '')} onChange={(event) => set(name, event.target.value)} disabled={disabled} required={required} /></label>;
}
function DateTimeField({ label, name, form, set }: { label: string; name: string; form: Record<string, string | number | boolean>; set: SetField }) {
    return <label><span>{label}</span><input className={adminInputClass} type="datetime-local" value={String(form[name] ?? '')} onChange={(event) => set(name, event.target.value)} /></label>;
}
function NumberField({ label, name, form, set }: { label: string; name: string; form: Record<string, string | number | boolean>; set: SetField }) {
    return <label><span>{label}</span><input className={adminInputClass} type="number" min={0} max={10000} value={Number(form[name] ?? 0)} onChange={(event) => set(name, Number(event.target.value))} required /></label>;
}
function ActiveField({ form, set }: { form: Record<string, string | number | boolean>; set: SetField }) {
    return <label className="admin-checkbox"><input type="checkbox" checked={Boolean(form.active)} onChange={(event) => set('active', event.target.checked)} /><span>Ativo</span></label>;
}

function referenceFormDefaults(kind: ReferenceKind, item: ReferenceItem | null): Record<string, string | number | boolean> {
    if (!item) {
        if (kind === 'platforms') return { code: '', family: 'PC', displayName: '', active: true, sortOrder: 0 };
        if (kind === 'services') return { code: '', displayName: '', publisher: '', active: true };
        if (kind === 'plans') return { serviceId: '', code: '', displayName: '', active: true, sortOrder: 0 };
        return { planId: '', regionCode: 'BR', active: true, sourceUrl: '', validFrom: '', validUntil: '', lastVerifiedAt: '', gameCatalogDownload: false, onlineMultiplayer: false, monthlyClaimedGames: false, cloudStreaming: false };
    }
    if (kind === 'platforms' && 'family' in item) return { code: item.code, family: item.family, displayName: item.displayName, active: item.active, sortOrder: item.sortOrder };
    if (kind === 'services' && 'publisher' in item) return { code: item.code, displayName: item.displayName, publisher: item.publisher, active: item.active };
    if (kind === 'plans' && 'serviceId' in item && 'sortOrder' in item) return { serviceId: item.serviceId, code: item.code, displayName: item.displayName, active: item.active, sortOrder: item.sortOrder };
    if ('planId' in item) return { planId: item.planId, regionCode: item.regionCode, active: item.active, sourceUrl: item.sourceUrl ?? '', validFrom: toLocalDateInput(item.validFrom), validUntil: toLocalDateInput(item.validUntil), lastVerifiedAt: toLocalDateInput(item.lastVerifiedAt), gameCatalogDownload: Boolean(item.capabilities.gameCatalogDownload), onlineMultiplayer: Boolean(item.capabilities.onlineMultiplayer), monthlyClaimedGames: Boolean(item.capabilities.monthlyClaimedGames), cloudStreaming: Boolean(item.capabilities.cloudStreaming) };
    return {};
}

function referencePayload(kind: ReferenceKind, form: Record<string, string | number | boolean>) {
    if (kind === 'platforms') return { code: form.code, family: form.family, displayName: form.displayName, active: form.active, sortOrder: Number(form.sortOrder) };
    if (kind === 'services') return { code: form.code, displayName: form.displayName, publisher: form.publisher, active: form.active };
    if (kind === 'plans') return { serviceId: form.serviceId, code: form.code, displayName: form.displayName, active: form.active, sortOrder: Number(form.sortOrder) };
    return { planId: form.planId, regionCode: String(form.regionCode).toUpperCase(), active: form.active, capabilities: { gameCatalogDownload: Boolean(form.gameCatalogDownload), onlineMultiplayer: Boolean(form.onlineMultiplayer), monthlyClaimedGames: Boolean(form.monthlyClaimedGames), cloudStreaming: Boolean(form.cloudStreaming) }, validFrom: fromLocalDateInput(form.validFrom), validUntil: fromLocalDateInput(form.validUntil), sourceUrl: form.sourceUrl || null, lastVerifiedAt: fromLocalDateInput(form.lastVerifiedAt) };
}

function toLocalDateInput(value: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
}

function fromLocalDateInput(value: string | number | boolean | undefined): string | null {
    return typeof value === 'string' && value ? new Date(value).toISOString() : null;
}

function referenceId(kind: ReferenceKind, item: ReferenceItem): string {
    return kind === 'platforms' && 'family' in item ? item.code : 'id' in item ? item.id : '';
}
function referenceView(kind: ReferenceKind, item: ReferenceItem) {
    if (kind === 'platforms' && 'family' in item) return { title: item.displayName, code: item.code, scope: item.family, active: item.active, detail: `Ordem ${item.sortOrder}` };
    if (kind === 'services' && 'publisher' in item) return { title: item.displayName, code: item.code, scope: item.publisher, active: item.active, detail: 'Serviço de assinatura' };
    if (kind === 'plans' && 'serviceCode' in item) return { title: item.displayName, code: item.code, scope: item.serviceCode, active: item.active, detail: `Ordem ${item.sortOrder}` };
    if ('planCode' in item) return { title: item.planCode, code: item.regionCode, scope: formatAdminDate(item.validFrom), active: item.active, detail: Object.entries(item.capabilities).filter(([, enabled]) => enabled).map(([name]) => name).join(', ') || 'Sem capacidades' };
    return { title: '', code: '', scope: '', active: false, detail: '' };
}
