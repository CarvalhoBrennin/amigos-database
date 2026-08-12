import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, DatabaseZap, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type {
    AdminSession,
    GameDecisionProfile,
    GameNetworkPool,
    GamePlatformOffering,
    GamePrice,
    GameSubscriptionAvailability,
    PlatformCode,
} from '@shared/index';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
    deleteAdminDecisionResource,
    deleteAdminGameProfile,
    getAdminGame,
    getAdminReferences,
    listAdminCatalog,
    saveAdminGameProfile,
    saveAdminNetworkPool,
    saveAdminOffering,
    saveAdminPrice,
    saveAdminSubscriptionAvailability,
} from '@/services/adminApi';
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

type GameData = Awaited<ReturnType<typeof getAdminGame>>;
type ReferenceData = Awaited<ReturnType<typeof getAdminReferences>>;
type Offering = GameData['offerings'][number];
type NetworkPool = GameData['networkPools'][number];
type SubscriptionAvailability = GameData['subscriptionAvailability'][number];
type Price = GameData['prices'][number];
type EditorState =
    | { kind: 'profile'; value: GameDecisionProfile | null }
    | { kind: 'offering'; value: Offering | null }
    | { kind: 'network-pool'; value: NetworkPool | null }
    | { kind: 'subscription'; value: SubscriptionAvailability | null }
    | { kind: 'price'; value: Price | null };

export function AdminCatalogPanel({ session }: { session: AdminSession }) {
    const [page, setPage] = useState(1);
    const [searchDraft, setSearchDraft] = useState('');
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
    const query = useQuery({
        queryKey: ['admin', 'catalog', page, search, status],
        queryFn: () => listAdminCatalog({ page, pageSize: 25, search, status: status || undefined }),
        enabled: !selectedGameId,
    });
    const submitSearch = (event: FormEvent) => {
        event.preventDefault();
        setPage(1);
        setSearch(searchDraft.trim());
    };

    if (selectedGameId) {
        return (
            <AdminGameWorkspace
                gameId={selectedGameId}
                session={session}
                onBack={() => setSelectedGameId(null)}
            />
        );
    }

    return (
        <div className="admin-page">
            <AdminPageHeader
                eyebrow="Base de decisão"
                title="Dados dos jogos"
                description="Complete compatibilidade, acesso e preço sem transformar ausência de evidência em certeza."
            />
            <AdminPanel>
                <form className="admin-toolbar" onSubmit={submitSearch}>
                    <label className="admin-search-field">
                        <span className="sr-only">Buscar jogo</span>
                        <Search aria-hidden="true" />
                        <input className={adminInputClass} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Título ou ID do jogo" />
                    </label>
                    <select className={adminSelectClass} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Filtrar qualidade dos dados">
                        <option value="">Todos os estados</option>
                        <option value="COMPLETE">Completo</option>
                        <option value="PARTIAL">Parcial</option>
                        <option value="UNKNOWN">Desconhecido</option>
                        <option value="MISSING">Sem perfil</option>
                    </select>
                    <Button type="submit" variant="secondary">Buscar</Button>
                </form>
                {query.isLoading ? <AdminLoading /> : query.error ? <AdminFeedback message={getAdminErrorMessage(query.error)} /> : query.data?.games.length ? (
                    <>
                        <div className="admin-table-wrap">
                            <table className="admin-table">
                                <thead><tr><th>Jogo</th><th>Qualidade</th><th>Compatibilidade</th><th>Acesso</th><th>Preços</th><th><span className="sr-only">Ações</span></th></tr></thead>
                                <tbody>{query.data.games.map((game) => (
                                    <tr key={game.id}>
                                        <td><span className="admin-game-cell">{game.imageUrl ? <img src={game.imageUrl} alt="" /> : <span aria-hidden="true"><DatabaseZap /></span>}<span><strong>{game.title}</strong><small>{game.id} · {game.year}</small></span></span></td>
                                        <td><AdminStatus tone={statusTone(game.decisionDataStatus)}>{statusLabel(game.decisionDataStatus)}</AdminStatus></td>
                                        <td>{game.offeringsCount} ofertas · {game.networkPoolsCount} redes</td>
                                        <td>{game.subscriptionRecordsCount} registros</td>
                                        <td>{game.priceRecordsCount} observações</td>
                                        <td><Button size="sm" variant="ghost" onClick={() => setSelectedGameId(game.id)}>Gerenciar</Button></td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                        <AdminPagination {...query.data.meta} onChange={setPage} />
                    </>
                ) : <AdminEmpty title="Nenhum jogo encontrado" description="Ajuste os filtros para localizar um item do catálogo estático." />}
            </AdminPanel>
        </div>
    );
}

function AdminGameWorkspace({ gameId, session, onBack }: { gameId: string; session: AdminSession; onBack: () => void }) {
    const [editor, setEditor] = useState<EditorState | null>(null);
    const queryClient = useQueryClient();
    const canWrite = session.permissions.includes('DECISION_DATA_WRITE');
    const gameQuery = useQuery({ queryKey: ['admin', 'game', gameId], queryFn: () => getAdminGame(gameId) });
    const referencesQuery = useQuery({ queryKey: ['admin', 'references'], queryFn: getAdminReferences });
    const removeMutation = useMutation({
        mutationFn: ({ resource, id }: { resource: 'offering' | 'network-pool' | 'subscription-availability' | 'price'; id: string }) =>
            deleteAdminDecisionResource(gameId, resource, id),
        onSuccess: (data) => updateGameCaches(queryClient, gameId, data),
    });
    const deleteProfileMutation = useMutation({
        mutationFn: () => deleteAdminGameProfile(gameId),
        onSuccess: (data) => updateGameCaches(queryClient, gameId, data),
    });
    const remove = (resource: 'offering' | 'network-pool' | 'subscription-availability' | 'price', id: string) => {
        if (window.confirm('Excluir este registro de decisão? A ação ficará registrada na auditoria.')) {
            removeMutation.mutate({ resource, id });
        }
    };

    return (
        <div className="admin-page admin-game-workspace">
            <button type="button" className="admin-back-button" onClick={onBack}><ArrowLeft aria-hidden="true" /> Voltar ao catálogo</button>
            {gameQuery.isLoading ? <AdminLoading /> : gameQuery.error ? <AdminFeedback message={getAdminErrorMessage(gameQuery.error)} /> : gameQuery.data ? (
                <>
                    <header className="admin-game-header">
                        {gameQuery.data.game.imageUrl ? <img src={gameQuery.data.game.imageUrl} alt="" /> : <span className="admin-game-header__fallback"><DatabaseZap aria-hidden="true" /></span>}
                        <div><p className="admin-eyebrow">Registro de decisão</p><h1>{gameQuery.data.game.title}</h1><code>{gameQuery.data.game.id}</code></div>
                        <AdminStatus tone={statusTone(gameQuery.data.profile?.dataStatus ?? 'MISSING')}>{statusLabel(gameQuery.data.profile?.dataStatus ?? 'MISSING')}</AdminStatus>
                    </header>
                    {removeMutation.error || deleteProfileMutation.error ? <AdminFeedback message={getAdminErrorMessage(removeMutation.error ?? deleteProfileMutation.error)} /> : null}
                    <AdminPanel
                        title="Perfil de decisão"
                        description="Limites de grupo, sessão, hardware e os eixos usados no ranking."
                        actions={canWrite ? <><Button size="sm" onClick={() => setEditor({ kind: 'profile', value: gameQuery.data.profile })}><Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> {gameQuery.data.profile ? 'Editar perfil' : 'Criar perfil'}</Button>{gameQuery.data.profile ? <Button size="sm" variant="ghost" isLoading={deleteProfileMutation.isPending} onClick={() => { if (window.confirm('Excluir o perfil de decisão? Os demais registros serão preservados.')) deleteProfileMutation.mutate(); }}><Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Excluir perfil</Button> : null}</> : undefined}
                    >
                        {gameQuery.data.profile ? <ProfileSummary profile={gameQuery.data.profile} /> : <AdminEmpty title="Perfil ausente" description="O motor tratará os dados desconhecidos de forma conservadora até que sejam documentados." />}
                    </AdminPanel>
                    <DecisionResourcePanel
                        title="Ofertas por plataforma"
                        description="Disponibilidade, multiplayer e exigência de assinatura online."
                        empty="Nenhuma oferta de plataforma cadastrada."
                        count={gameQuery.data.offerings.length}
                        canWrite={canWrite}
                        onAdd={() => setEditor({ kind: 'offering', value: null })}
                    >
                        {gameQuery.data.offerings.map((item) => (
                            <DecisionRecord key={item.id} title={item.platformCode} subtitle={`${item.regionCode ?? 'Global'} · ${item.onlineSupported ? 'online' : 'sem online'}`} status={item.verificationStatus} sourceUrl={item.sourceUrl} verifiedAt={item.lastVerifiedAt} onEdit={canWrite ? () => setEditor({ kind: 'offering', value: item }) : undefined} onDelete={canWrite ? () => remove('offering', item.id) : undefined} />
                        ))}
                    </DecisionResourcePanel>
                    <DecisionResourcePanel
                        title="Pools de rede"
                        description="Grupos de plataformas que realmente conseguem jogar entre si."
                        empty="Nenhum pool de rede cadastrado."
                        count={gameQuery.data.networkPools.length}
                        canWrite={canWrite}
                        onAdd={() => setEditor({ kind: 'network-pool', value: null })}
                    >
                        {gameQuery.data.networkPools.map((item) => (
                            <DecisionRecord key={item.id} title={item.poolCode} subtitle={`${item.regionCode ?? 'Global'} · ${item.platforms.join(', ')}`} status={item.verificationStatus} sourceUrl={item.sourceUrl} verifiedAt={item.lastVerifiedAt} onEdit={canWrite ? () => setEditor({ kind: 'network-pool', value: item }) : undefined} onDelete={canWrite ? () => remove('network-pool', item.id) : undefined} />
                        ))}
                    </DecisionResourcePanel>
                    <DecisionResourcePanel
                        title="Disponibilidade em assinaturas"
                        description="Acesso por plano, plataforma, região e período de validade."
                        empty="Nenhum acesso por assinatura cadastrado."
                        count={gameQuery.data.subscriptionAvailability.length}
                        canWrite={canWrite}
                        onAdd={() => setEditor({ kind: 'subscription', value: null })}
                    >
                        {gameQuery.data.subscriptionAvailability.map((item) => (
                            <DecisionRecord key={item.id} title={item.planCode} subtitle={`${item.platformCode} · ${item.regionCode} · ${item.accessType === 'DOWNLOAD' ? 'download' : 'nuvem'}`} status={item.verificationStatus} sourceUrl={item.sourceUrl} verifiedAt={item.lastVerifiedAt} onEdit={canWrite ? () => setEditor({ kind: 'subscription', value: item }) : undefined} onDelete={canWrite ? () => remove('subscription-availability', item.id) : undefined} />
                        ))}
                    </DecisionResourcePanel>
                    <DecisionResourcePanel
                        title="Preços observados"
                        description="Valores inteiros na menor unidade monetária, sempre vinculados à fonte."
                        empty="Nenhum preço observado cadastrado."
                        count={gameQuery.data.prices.length}
                        canWrite={canWrite}
                        onAdd={() => setEditor({ kind: 'price', value: null })}
                    >
                        {gameQuery.data.prices.map((item) => (
                            <DecisionRecord key={item.id} title={`${item.currency} ${formatMinor(item.amountMinor, item.currency)}`} subtitle={`${item.platformCode} · ${item.regionCode} · ${item.storeCode}`} status={item.quality} sourceUrl={item.sourceUrl} verifiedAt={item.observedAt} onEdit={canWrite ? () => setEditor({ kind: 'price', value: item }) : undefined} onDelete={canWrite ? () => remove('price', item.id) : undefined} />
                        ))}
                    </DecisionResourcePanel>
                    {referencesQuery.error ? <AdminFeedback message={`Referências indisponíveis: ${getAdminErrorMessage(referencesQuery.error)}`} /> : null}
                    {editor ? (
                        <DecisionEditor
                            key={`${editor.kind}:${'id' in (editor.value ?? {}) ? (editor.value as { id: string }).id : 'new'}`}
                            gameId={gameId}
                            editor={editor}
                            references={referencesQuery.data ?? null}
                            onClose={() => setEditor(null)}
                            onSaved={(data) => {
                                updateGameCaches(queryClient, gameId, data);
                                setEditor(null);
                            }}
                        />
                    ) : null}
                </>
            ) : null}
        </div>
    );
}

function ProfileSummary({ profile }: { profile: GameDecisionProfile }) {
    const axes = [
        ['Comunicação', profile.communication],
        ['Habilidade', profile.skill],
        ['Caos', profile.chaos],
        ['Estratégia', profile.strategy],
        ['História', profile.story],
    ];
    return (
        <div className="admin-profile-summary">
            <dl className="admin-definition-list">
                <div><dt>Jogadores online</dt><dd>{rangeLabel(profile.minOnlinePlayers, profile.maxOnlinePlayers)}</dd></div>
                <div><dt>Duração</dt><dd>{rangeLabel(profile.minSessionMinutes, profile.maxSessionMinutes, ' min')}</dd></div>
                <div><dt>Instalação</dt><dd>{profile.installSizeMb === null ? 'Desconhecida' : `${Math.round(profile.installSizeMb / 1024)} GB`}</dd></div>
                <div><dt>PC mínimo</dt><dd>{profile.minPcTier ?? 'Desconhecido'}</dd></div>
                <div><dt>Modelo</dt><dd>{profile.freeToPlay ? 'Grátis para jogar' : 'Pago ou desconhecido'}</dd></div>
                <div><dt>Dificuldade</dt><dd>{profile.difficultyCode ?? 'Desconhecida'}</dd></div>
            </dl>
            <div className="admin-axis-grid">{axes.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value ?? '—'}</strong><div><i style={{ width: `${Number(value ?? 0) * 10}%` }} /></div></div>)}</div>
            <p className="admin-source-line">Fonte: {profile.sourceUrl ? <a href={profile.sourceUrl} target="_blank" rel="noreferrer">{profile.sourceType ?? 'externa'}</a> : 'não informada'} · verificada em {formatAdminDate(profile.lastVerifiedAt)}</p>
        </div>
    );
}

function DecisionResourcePanel({ title, description, empty, count, canWrite, onAdd, children }: {
    title: string;
    description: string;
    empty: string;
    count: number;
    canWrite: boolean;
    onAdd: () => void;
    children: React.ReactNode;
}) {
    return (
        <AdminPanel title={`${title} · ${count}`} description={description} actions={canWrite ? <Button size="sm" variant="secondary" onClick={onAdd}><Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Adicionar</Button> : undefined}>
            {count === 0 ? <AdminEmpty title="Sem registros" description={empty} /> : <div className="admin-decision-records">{children}</div>}
        </AdminPanel>
    );
}

function DecisionRecord({ title, subtitle, status, sourceUrl, verifiedAt, onEdit, onDelete }: {
    title: string;
    subtitle: string;
    status: string;
    sourceUrl: string | null;
    verifiedAt: string | null;
    onEdit?: () => void;
    onDelete?: () => void;
}) {
    return (
        <article className="admin-decision-record">
            <div><strong>{title}</strong><span>{subtitle}</span><small>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">Abrir fonte</a> : 'Sem fonte'} · {formatAdminDate(verifiedAt)}</small></div>
            <AdminStatus tone={recordStatusTone(status)}>{recordStatusLabel(status)}</AdminStatus>
            {onEdit || onDelete ? <span className="admin-row-actions">{onEdit ? <Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Editar</span></Button> : null}{onDelete ? <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Excluir</span></Button> : null}</span> : null}
        </article>
    );
}

function DecisionEditor({ gameId, editor, references, onClose, onSaved }: {
    gameId: string;
    editor: EditorState;
    references: ReferenceData | null;
    onClose: () => void;
    onSaved: (data: GameData) => void;
}) {
    if (editor.kind === 'profile') return <ProfileEditor gameId={gameId} value={editor.value} onClose={onClose} onSaved={onSaved} />;
    if (editor.kind === 'offering') return <OfferingEditor gameId={gameId} value={editor.value} references={references} onClose={onClose} onSaved={onSaved} />;
    if (editor.kind === 'network-pool') return <NetworkPoolEditor gameId={gameId} value={editor.value} references={references} onClose={onClose} onSaved={onSaved} />;
    if (editor.kind === 'subscription') return <SubscriptionEditor gameId={gameId} value={editor.value} references={references} onClose={onClose} onSaved={onSaved} />;
    return <PriceEditor gameId={gameId} value={editor.value} references={references} onClose={onClose} onSaved={onSaved} />;
}

function ProfileEditor({ gameId, value, onClose, onSaved }: { gameId: string; value: GameDecisionProfile | null; onClose: () => void; onSaved: (data: GameData) => void }) {
    const [form, setForm] = useState<GameDecisionProfile>(value ?? emptyProfile());
    const mutation = useMutation({ mutationFn: () => saveAdminGameProfile(gameId, form), onSuccess: onSaved });
    const setNumber = (key: NumberProfileKey, raw: string) => setForm((current) => ({ ...current, [key]: nullableNumber(raw) }));
    return (
        <EditorModal title="Perfil de decisão" onClose={onClose} onSubmit={() => mutation.mutate()} pending={mutation.isPending} error={mutation.error}>
            <div className="admin-form-grid admin-form-grid--three">
                <NumberInput label="Mín. jogadores" value={form.minOnlinePlayers} onChange={(raw) => setNumber('minOnlinePlayers', raw)} />
                <NumberInput label="Máx. jogadores" value={form.maxOnlinePlayers} onChange={(raw) => setNumber('maxOnlinePlayers', raw)} />
                <NumberInput label="Instalação (MB)" value={form.installSizeMb} min={0} onChange={(raw) => setNumber('installSizeMb', raw)} />
                <NumberInput label="Sessão mínima (min)" value={form.minSessionMinutes} onChange={(raw) => setNumber('minSessionMinutes', raw)} />
                <NumberInput label="Sessão máxima (min)" value={form.maxSessionMinutes} onChange={(raw) => setNumber('maxSessionMinutes', raw)} />
                <label><span>PC mínimo</span><select className={adminSelectClass} value={form.minPcTier ?? ''} onChange={(event) => setForm({ ...form, minPcTier: event.target.value ? event.target.value as GameDecisionProfile['minPcTier'] : null })}><option value="">Desconhecido</option><option value="LOW">Baixo</option><option value="MID">Médio</option><option value="HIGH">Alto</option></select></label>
                {(['communication', 'skill', 'chaos', 'strategy', 'story'] as const).map((key) => <NumberInput key={key} label={axisLabel(key)} value={form[key]} min={0} max={10} onChange={(raw) => setNumber(key, raw)} />)}
                <label><span>Dificuldade</span><select className={adminSelectClass} value={form.difficultyCode ?? ''} onChange={(event) => setForm({ ...form, difficultyCode: event.target.value ? event.target.value as GameDecisionProfile['difficultyCode'] : null })}><option value="">Desconhecida</option><option value="EASY">Fácil</option><option value="MODERATE">Moderada</option><option value="HARD">Difícil</option><option value="BRUTAL">Brutal</option></select></label>
                <label><span>Qualidade dos dados</span><select className={adminSelectClass} value={form.dataStatus} onChange={(event) => setForm({ ...form, dataStatus: event.target.value as GameDecisionProfile['dataStatus'] })}><option value="UNKNOWN">Desconhecido</option><option value="PARTIAL">Parcial</option><option value="COMPLETE">Completo</option></select></label>
                <SourceTypeSelect value={form.sourceType} onChange={(sourceType) => setForm({ ...form, sourceType })} nullable />
                <UrlInput value={form.sourceUrl} onChange={(sourceUrl) => setForm({ ...form, sourceUrl })} />
                <DateInput label="Verificado em" value={form.lastVerifiedAt} onChange={(lastVerifiedAt) => setForm({ ...form, lastVerifiedAt })} />
                <label className="admin-checkbox"><input type="checkbox" checked={form.freeToPlay} onChange={(event) => setForm({ ...form, freeToPlay: event.target.checked })} /><span>Grátis para jogar</span></label>
            </div>
        </EditorModal>
    );
}

function OfferingEditor({ gameId, value, references, onClose, onSaved }: { gameId: string; value: Offering | null; references: ReferenceData | null; onClose: () => void; onSaved: (data: GameData) => void }) {
    const [form, setForm] = useState<GamePlatformOffering>(value ? stripId(value) : emptyOffering(references));
    const mutation = useMutation({ mutationFn: () => saveAdminOffering(gameId, form, value?.id), onSuccess: onSaved });
    return (
        <EditorModal title={value ? 'Editar oferta' : 'Nova oferta'} onClose={onClose} onSubmit={() => mutation.mutate()} pending={mutation.isPending} error={mutation.error}>
            <div className="admin-form-grid admin-form-grid--three">
                <PlatformSelect references={references} value={form.platformCode} onChange={(platformCode) => setForm({ ...form, platformCode })} />
                <TextInput label="Região (vazio = global)" value={form.regionCode ?? ''} maxLength={2} onChange={(raw) => setForm({ ...form, regionCode: nullableUpper(raw) })} />
                <VerificationSelect label="Verificação geral" value={form.verificationStatus} onChange={(verificationStatus) => setForm({ ...form, verificationStatus })} />
                <VerificationSelect label="Verificação da assinatura online" value={form.onlineRequirementVerificationStatus} onChange={(onlineRequirementVerificationStatus) => setForm({ ...form, onlineRequirementVerificationStatus })} />
                <SourceTypeSelect value={form.sourceType} onChange={(sourceType) => setForm({ ...form, sourceType: sourceType ?? 'ADMIN_IMPORT' })} />
                <UrlInput value={form.sourceUrl} onChange={(sourceUrl) => setForm({ ...form, sourceUrl })} />
                <DateInput label="Verificado em" value={form.lastVerifiedAt} onChange={(lastVerifiedAt) => setForm({ ...form, lastVerifiedAt })} />
                <DateInput label="Válido desde" value={form.validFrom} onChange={(validFrom) => setForm({ ...form, validFrom })} />
                <DateInput label="Válido até" value={form.validUntil} onChange={(validUntil) => setForm({ ...form, validUntil })} />
                <label><span>Exige assinatura online paga</span><select className={adminSelectClass} value={form.requiresPaidOnlineSubscription === null ? '' : String(form.requiresPaidOnlineSubscription)} onChange={(event) => setForm({ ...form, requiresPaidOnlineSubscription: event.target.value === '' ? null : event.target.value === 'true' })}><option value="">Desconhecido</option><option value="true">Sim</option><option value="false">Não</option></select></label>
                <BooleanField label="Suporta online" value={form.onlineSupported} onChange={(onlineSupported) => setForm({ ...form, onlineSupported })} />
                <BooleanField label="Grátis para jogar" value={form.freeToPlay} onChange={(freeToPlay) => setForm({ ...form, freeToPlay })} />
            </div>
        </EditorModal>
    );
}

function NetworkPoolEditor({ gameId, value, references, onClose, onSaved }: { gameId: string; value: NetworkPool | null; references: ReferenceData | null; onClose: () => void; onSaved: (data: GameData) => void }) {
    const [form, setForm] = useState<GameNetworkPool>(value ? stripId(value) : emptyNetworkPool());
    const mutation = useMutation({ mutationFn: () => saveAdminNetworkPool(gameId, form, value?.id), onSuccess: onSaved });
    const togglePlatform = (code: PlatformCode) => setForm((current) => ({ ...current, platforms: current.platforms.includes(code) ? current.platforms.filter((item) => item !== code) : [...current.platforms, code] }));
    return (
        <EditorModal title={value ? 'Editar pool de rede' : 'Novo pool de rede'} onClose={onClose} onSubmit={() => mutation.mutate()} pending={mutation.isPending} error={mutation.error}>
            <div className="admin-form-grid admin-form-grid--three">
                <TextInput label="Código do pool" value={form.poolCode} onChange={(poolCode) => setForm({ ...form, poolCode: poolCode.toUpperCase() })} />
                <TextInput label="Região (vazio = global)" value={form.regionCode ?? ''} maxLength={2} onChange={(raw) => setForm({ ...form, regionCode: nullableUpper(raw) })} />
                <VerificationSelect label="Verificação" value={form.verificationStatus} onChange={(verificationStatus) => setForm({ ...form, verificationStatus })} />
                <SourceTypeSelect value={form.sourceType} onChange={(sourceType) => setForm({ ...form, sourceType: sourceType ?? 'ADMIN_IMPORT' })} />
                <UrlInput value={form.sourceUrl} onChange={(sourceUrl) => setForm({ ...form, sourceUrl })} />
                <DateInput label="Verificado em" value={form.lastVerifiedAt} onChange={(lastVerifiedAt) => setForm({ ...form, lastVerifiedAt })} />
                <DateInput label="Válido desde" value={form.validFrom} onChange={(validFrom) => setForm({ ...form, validFrom })} />
                <DateInput label="Válido até" value={form.validUntil} onChange={(validUntil) => setForm({ ...form, validUntil })} />
            </div>
            <fieldset className="admin-platform-picker"><legend>Plataformas no mesmo pool</legend>{references?.platforms.map((platform) => <label key={platform.code}><input type="checkbox" checked={form.platforms.includes(platform.code)} onChange={() => togglePlatform(platform.code)} /><span>{platform.displayName}</span><small>{platform.code}</small></label>) ?? <p>Carregando referências…</p>}</fieldset>
        </EditorModal>
    );
}

function SubscriptionEditor({ gameId, value, references, onClose, onSaved }: { gameId: string; value: SubscriptionAvailability | null; references: ReferenceData | null; onClose: () => void; onSaved: (data: GameData) => void }) {
    const [form, setForm] = useState<GameSubscriptionAvailability>(value ? stripId(value) : emptySubscription(references));
    const mutation = useMutation({ mutationFn: () => saveAdminSubscriptionAvailability(gameId, form, value?.id), onSuccess: onSaved });
    return (
        <EditorModal title={value ? 'Editar disponibilidade' : 'Nova disponibilidade'} onClose={onClose} onSubmit={() => mutation.mutate()} pending={mutation.isPending} error={mutation.error}>
            <div className="admin-form-grid admin-form-grid--three">
                <label><span>Plano</span><select className={adminSelectClass} value={form.planCode} onChange={(event) => setForm({ ...form, planCode: event.target.value })} required><option value="">Selecione</option>{references?.plans.map((plan) => <option key={plan.id} value={plan.code}>{plan.displayName} · {plan.code}</option>)}</select></label>
                <PlatformSelect references={references} value={form.platformCode} onChange={(platformCode) => setForm({ ...form, platformCode })} />
                <TextInput label="Região" value={form.regionCode} maxLength={2} onChange={(regionCode) => setForm({ ...form, regionCode: regionCode.toUpperCase() })} />
                <label><span>Tipo de acesso</span><select className={adminSelectClass} value={form.accessType} onChange={(event) => setForm({ ...form, accessType: event.target.value as GameSubscriptionAvailability['accessType'] })}><option value="DOWNLOAD">Download</option><option value="CLOUD_STREAM">Cloud streaming</option></select></label>
                <VerificationSelect label="Verificação" value={form.verificationStatus} onChange={(verificationStatus) => setForm({ ...form, verificationStatus })} />
                <SourceTypeSelect value={form.sourceType} onChange={(sourceType) => setForm({ ...form, sourceType: sourceType ?? 'ADMIN_IMPORT' })} />
                <UrlInput value={form.sourceUrl} onChange={(sourceUrl) => setForm({ ...form, sourceUrl })} />
                <DateInput label="Verificado em" value={form.lastVerifiedAt} onChange={(lastVerifiedAt) => setForm({ ...form, lastVerifiedAt })} />
                <DateInput label="Válido desde" value={form.validFrom} onChange={(validFrom) => setForm({ ...form, validFrom })} />
                <DateInput label="Válido até" value={form.validUntil} onChange={(validUntil) => setForm({ ...form, validUntil })} />
            </div>
        </EditorModal>
    );
}

function PriceEditor({ gameId, value, references, onClose, onSaved }: { gameId: string; value: Price | null; references: ReferenceData | null; onClose: () => void; onSaved: (data: GameData) => void }) {
    const [form, setForm] = useState<GamePrice>(value ? stripId(value) : emptyPrice(references));
    const mutation = useMutation({ mutationFn: () => saveAdminPrice(gameId, form, value?.id), onSuccess: onSaved });
    return (
        <EditorModal title={value ? 'Editar preço observado' : 'Novo preço observado'} onClose={onClose} onSubmit={() => mutation.mutate()} pending={mutation.isPending} error={mutation.error}>
            <div className="admin-form-grid admin-form-grid--three">
                <PlatformSelect references={references} value={form.platformCode} onChange={(platformCode) => setForm({ ...form, platformCode })} />
                <TextInput label="Região" value={form.regionCode} maxLength={2} onChange={(regionCode) => setForm({ ...form, regionCode: regionCode.toUpperCase() })} />
                <TextInput label="Loja" value={form.storeCode} onChange={(storeCode) => setForm({ ...form, storeCode: storeCode.toUpperCase() })} />
                <NumberInput label="Preço (menor unidade)" value={form.amountMinor} min={0} required onChange={(raw) => setForm({ ...form, amountMinor: Number(raw) })} />
                <NumberInput label="Preço regular (opcional)" value={form.regularAmountMinor} min={0} onChange={(raw) => setForm({ ...form, regularAmountMinor: nullableNumber(raw) })} />
                <TextInput label="Moeda" value={form.currency} maxLength={3} onChange={(currency) => setForm({ ...form, currency: currency.toUpperCase() })} />
                <label><span>Qualidade</span><select className={adminSelectClass} value={form.quality} onChange={(event) => setForm({ ...form, quality: event.target.value as GamePrice['quality'] })}><option value="VERIFIED_LOCAL">Verificado localmente</option><option value="PROVIDER_ESTIMATE">Estimativa de provedor</option><option value="LEGACY_STATIC">Legado estático</option></select></label>
                <UrlInput value={form.sourceUrl} onChange={(sourceUrl) => setForm({ ...form, sourceUrl: sourceUrl ?? '' })} required />
                <DateInput label="Observado em" value={form.observedAt} onChange={(observedAt) => setForm({ ...form, observedAt: observedAt ?? '' })} required />
                <DateInput label="Válido até" value={form.validUntil} onChange={(validUntil) => setForm({ ...form, validUntil })} />
            </div>
        </EditorModal>
    );
}

function EditorModal({ title, children, onClose, onSubmit, pending, error }: { title: string; children: React.ReactNode; onClose: () => void; onSubmit: () => void; pending: boolean; error: unknown }) {
    const submit = (event: FormEvent) => { event.preventDefault(); onSubmit(); };
    return (
        <Modal isOpen onClose={onClose} ariaLabel={title} size="wide">
            <form className="admin-modal admin-form admin-decision-editor" onSubmit={submit}>
                <header className="admin-modal__header"><div><p className="admin-eyebrow">Dados de decisão</p><h2>{title}</h2></div></header>
                {children}
                {error ? <AdminFeedback message={getAdminErrorMessage(error)} /> : null}
                <footer className="admin-form-actions"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" isLoading={pending}>Salvar registro</Button></footer>
            </form>
        </Modal>
    );
}

type NumberProfileKey = 'minOnlinePlayers' | 'maxOnlinePlayers' | 'minSessionMinutes' | 'maxSessionMinutes' | 'installSizeMb' | 'communication' | 'skill' | 'chaos' | 'strategy' | 'story';

function NumberInput({ label, value, onChange, min = 1, max, required = false }: { label: string; value: number | null; onChange: (raw: string) => void; min?: number; max?: number; required?: boolean }) {
    return <label><span>{label}</span><input className={adminInputClass} type="number" min={min} max={max} step={1} value={value ?? ''} onChange={(event) => onChange(event.target.value)} required={required} /></label>;
}

function TextInput({ label, value, onChange, maxLength = 80 }: { label: string; value: string; onChange: (value: string) => void; maxLength?: number }) {
    return <label><span>{label}</span><input className={adminInputClass} value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} required /></label>;
}

function UrlInput({ value, onChange, required = false }: { value: string | null; onChange: (value: string | null) => void; required?: boolean }) {
    return <label className="admin-form-span-2"><span>Fonte HTTPS</span><input className={adminInputClass} type="url" inputMode="url" placeholder="https://…" value={value ?? ''} onChange={(event) => onChange(event.target.value || null)} required={required} /></label>;
}

function DateInput({ label, value, onChange, required = false }: { label: string; value: string | null; onChange: (value: string | null) => void; required?: boolean }) {
    return <label><span>{label}</span><input className={adminInputClass} type="datetime-local" value={toLocalDateInput(value)} onChange={(event) => onChange(fromLocalDateInput(event.target.value))} required={required} /></label>;
}

function PlatformSelect({ references, value, onChange }: { references: ReferenceData | null; value: PlatformCode; onChange: (value: PlatformCode) => void }) {
    return <label><span>Plataforma</span><select className={adminSelectClass} value={value} onChange={(event) => onChange(event.target.value as PlatformCode)} required>{references?.platforms.map((platform) => <option key={platform.code} value={platform.code}>{platform.displayName} · {platform.code}</option>)}</select></label>;
}

function SourceTypeSelect({ value, onChange, nullable = false }: { value: GameDecisionProfile['sourceType']; onChange: (value: GameDecisionProfile['sourceType']) => void; nullable?: boolean }) {
    return <label><span>Tipo de fonte</span><select className={adminSelectClass} value={value ?? ''} onChange={(event) => onChange(event.target.value ? event.target.value as NonNullable<GameDecisionProfile['sourceType']> : null)}>{nullable ? <option value="">Não informado</option> : null}<option value="ADMIN_IMPORT">Importação administrativa</option><option value="OFFICIAL_MANUAL">Fonte oficial manual</option><option value="LICENSED_PROVIDER">Provedor licenciado</option></select></label>;
}

function VerificationSelect({ label, value, onChange }: { label: string; value: GamePlatformOffering['verificationStatus']; onChange: (value: GamePlatformOffering['verificationStatus']) => void }) {
    return <label><span>{label}</span><select className={adminSelectClass} value={value} onChange={(event) => onChange(event.target.value as GamePlatformOffering['verificationStatus'])}><option value="UNKNOWN">Desconhecido</option><option value="STALE">Vencido</option><option value="VERIFIED">Verificado</option></select></label>;
}

function BooleanField({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
    return <label className="admin-checkbox"><input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

function emptyProfile(): GameDecisionProfile {
    return { minOnlinePlayers: null, maxOnlinePlayers: null, minSessionMinutes: null, maxSessionMinutes: null, installSizeMb: null, minPcTier: null, freeToPlay: false, communication: null, skill: null, chaos: null, strategy: null, story: null, difficultyCode: null, dataStatus: 'UNKNOWN', sourceType: null, sourceUrl: null, lastVerifiedAt: null };
}

function emptyOffering(references: ReferenceData | null): GamePlatformOffering {
    return { platformCode: references?.platforms[0]?.code ?? 'BROWSER', regionCode: null, onlineSupported: true, freeToPlay: false, requiresPaidOnlineSubscription: null, onlineRequirementVerificationStatus: 'UNKNOWN', sourceType: 'ADMIN_IMPORT', sourceUrl: null, verificationStatus: 'UNKNOWN', lastVerifiedAt: null, validFrom: null, validUntil: null };
}

function emptyNetworkPool(): GameNetworkPool {
    return { poolCode: '', regionCode: null, platforms: [], sourceType: 'ADMIN_IMPORT', sourceUrl: null, verificationStatus: 'UNKNOWN', lastVerifiedAt: null, validFrom: null, validUntil: null };
}

function emptySubscription(references: ReferenceData | null): GameSubscriptionAvailability {
    return { planCode: references?.plans[0]?.code ?? '', platformCode: references?.platforms[0]?.code ?? 'BROWSER', regionCode: 'BR', accessType: 'DOWNLOAD', validFrom: null, validUntil: null, verificationStatus: 'UNKNOWN', sourceType: 'ADMIN_IMPORT', sourceUrl: null, lastVerifiedAt: null };
}

function emptyPrice(references: ReferenceData | null): GamePrice {
    return { platformCode: references?.platforms[0]?.code ?? 'BROWSER', regionCode: 'BR', storeCode: '', amountMinor: 0, currency: 'BRL', regularAmountMinor: null, quality: 'PROVIDER_ESTIMATE', sourceUrl: '', observedAt: new Date().toISOString(), validUntil: null };
}

function stripId<T extends { id: string }>(value: T): Omit<T, 'id'> {
    const copy: Partial<T> = { ...value };
    delete copy.id;
    return copy as Omit<T, 'id'>;
}

function nullableNumber(raw: string): number | null {
    return raw === '' ? null : Number(raw);
}

function nullableUpper(raw: string): string | null {
    const value = raw.trim().toUpperCase();
    return value || null;
}

function toLocalDateInput(value: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
}

function fromLocalDateInput(value: string): string | null {
    return value ? new Date(value).toISOString() : null;
}

function axisLabel(key: NumberProfileKey): string {
    const labels: Record<NumberProfileKey, string> = { minOnlinePlayers: 'Mín. jogadores', maxOnlinePlayers: 'Máx. jogadores', minSessionMinutes: 'Sessão mínima', maxSessionMinutes: 'Sessão máxima', installSizeMb: 'Instalação', communication: 'Comunicação (0–10)', skill: 'Habilidade (0–10)', chaos: 'Caos (0–10)', strategy: 'Estratégia (0–10)', story: 'História (0–10)' };
    return labels[key];
}

function rangeLabel(min: number | null, max: number | null, suffix = ''): string {
    if (min === null && max === null) return 'Desconhecido';
    return `${min ?? '?'}–${max ?? '?'}${suffix}`;
}

function statusTone(status: string): 'good' | 'warning' | 'neutral' | 'danger' {
    if (status === 'COMPLETE') return 'good';
    if (status === 'PARTIAL') return 'warning';
    if (status === 'MISSING') return 'danger';
    return 'neutral';
}

function statusLabel(status: string): string {
    if (status === 'COMPLETE') return 'Completo';
    if (status === 'PARTIAL') return 'Parcial';
    if (status === 'MISSING') return 'Sem perfil';
    return 'Desconhecido';
}

function recordStatusTone(status: string): 'good' | 'warning' | 'neutral' {
    if (status === 'VERIFIED' || status === 'VERIFIED_LOCAL') return 'good';
    if (status === 'STALE' || status === 'PROVIDER_ESTIMATE') return 'warning';
    return 'neutral';
}

function recordStatusLabel(status: string): string {
    const labels: Record<string, string> = { VERIFIED: 'Verificado', STALE: 'Vencido', UNKNOWN: 'Desconhecido', VERIFIED_LOCAL: 'Verificado', PROVIDER_ESTIMATE: 'Estimativa', LEGACY_STATIC: 'Legado' };
    return labels[status] ?? status;
}

function formatMinor(amountMinor: number, currency: string): string {
    try {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amountMinor / 100).replace(/^\D+\s?/, '');
    } catch {
        return String(amountMinor);
    }
}

function updateGameCaches(queryClient: ReturnType<typeof useQueryClient>, gameId: string, data: GameData): void {
    queryClient.setQueryData(['admin', 'game', gameId], data);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'catalog'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
}
