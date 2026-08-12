# Deploy do AMIGOS Database

## Topologia suportada

Use três componentes independentes:

1. frontend estático (`dist/`) em Vercel ou host equivalente;
2. API Node 22 persistente (`dist-server/server/src/main.js`) com WebSocket;
3. PostgreSQL gerenciado com TLS, backup e credenciais próprias por ambiente.

A API pode ter múltiplas réplicas. Todas devem acessar o mesmo PostgreSQL: `LISTEN/NOTIFY` distribui eventos para os sockets locais de cada instância. Notifications são pequenas e não duráveis; o cliente sempre converge por `room.version` e refetch REST após reconexão.

Não implante a API como função efêmera sem comprovar suporte a conexão WebSocket persistente e coordenação entre instâncias.

## 1. Gate de release

Em um PostgreSQL de teste limpo:

```bash
npm ci
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run check
npm run test:e2e
```

O release fica bloqueado se lint, i18n, typecheck, cobertura, integração, audit, build ou E2E falhar. `db:seed` precisa ser idempotente.

## 2. Banco de produção

Requisitos:

- PostgreSQL compatível com a migration atual;
- TLS com cadeia de certificados validável;
- backups automáticos e teste de restauração;
- pool e limite de conexões dimensionados para o número de réplicas;
- acesso de rede restrito à API e ao executor de migrations;
- monitoramento de espaço, conexões e falhas de query.

Ordem do deploy:

```text
build -> migration única -> start/rollout da API -> smoke test -> frontend
```

Execute migrations uma vez por release, em job controlado:

```bash
DATABASE_URL=postgresql://... npm run db:migrate
DATABASE_URL=postgresql://... npm run db:seed
```

Não deixe todas as réplicas disputarem migrations no startup. As migrations são forward-only; faça backup antes de alteração destrutiva futura.

## 3. API

Build e comando de processo:

```bash
npm ci
npm run build:api
npm run start:api
```

Variáveis obrigatórias mínimas:

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=3001
WEB_ORIGIN=https://app.seu-dominio.tld
PUBLIC_WEB_URL=https://app.seu-dominio.tld
API_PUBLIC_URL=https://api.seu-dominio.tld
DATABASE_URL=postgresql://...
SESSION_SECRET=<aleatorio-com-32+-caracteres>
TOKEN_PEPPER=<outro-segredo-aleatorio-com-32+-caracteres>
ROOM_TTL_HOURS=168
GUEST_SESSION_TTL_HOURS=168
MAX_ROOM_PARTICIPANTS=12
BODY_LIMIT_BYTES=65536
LOG_LEVEL=info
YOUTUBE_API_KEY=
YOUTUBE_CACHE_TTL_HOURS=720
YOUTUBE_NEGATIVE_CACHE_TTL_HOURS=72
```

Regras:

- `SESSION_SECRET` e `TOKEN_PEPPER` devem ser diferentes e fornecidos pelo secret manager;
- `YOUTUBE_API_KEY` é opcional e nunca pode existir como `VITE_*`;
- `WEB_ORIGIN` aceita lista separada por vírgulas, mas somente origins controladas;
- previews não recebem wildcard: adicione cada origin autorizada ou use uma lista gerada por pipeline confiável;
- termine TLS antes da API e preserve upgrade WebSocket;
- exponha `GET /api/v1/health` para liveness e `GET /api/v1/ready` para readiness com PostgreSQL.

Smoke tests, sem credenciais:

```bash
curl --fail https://api.seu-dominio.tld/api/v1/health
curl --fail https://api.seu-dominio.tld/api/v1/ready
```

## 4. Frontend e CSP

`vercel.json` e `public/_headers` carregam placeholders deliberadamente não roteáveis:

```text
https://api.example.invalid
wss://api.example.invalid
```

Em um checkout limpo do artefato de deploy, substitua ambos de forma validada:

```bash
npm run csp:configure -- --api-origin=https://api.seu-dominio.tld
```

O script aceita apenas origin HTTPS sem credenciais, path, query ou fragment e deriva o origin WSS. Revise o diff e confirme que os dois arquivos têm o mesmo par explícito:

```bash
npm run csp:check
```

No pipeline configurado, valide também o valor esperado:

```bash
CSP_API_ORIGIN=https://api.seu-dominio.tld npm run csp:check
```

O artefato de produção não pode conter `.invalid`. Nunca use `connect-src *`, `https:` ou `wss:` como substituto dos hosts exatos.

Configure o CSP antes do build, porque Vite copia `public/_headers` para `dist/`. Em seguida gere o artefato:

```bash
VITE_SITE_URL=https://app.seu-dominio.tld \
VITE_API_BASE_URL=https://api.seu-dominio.tld \
npm run build:web
```

Publique `dist/` com fallback SPA para `index.html`.

Em integração Git direta da Vercel, gere e versione uma configuração específica para o domínio de produção ou use um proxy same-origin controlado. O build da Vercel não deve depender de alterar `vercel.json` depois que a plataforma já o interpretou.

## 5. Dados de decisão

As migrations criam estrutura e referências de planos/plataformas. Elas não inventam catálogo de assinatura, crossplay, entitlement ou preço.

Antes de habilitar recomendação ampla:

```bash
npm run import:decision-data -- --file /secure/decision-data.json
npm run import:subscriptions -- --file /secure/subscriptions.json
npm run import:prices -- --file /secure/prices.json
npm run audit:decision-data
```

Revise o dry-run e só então repita com `--apply`. Guarde arquivos reais em armazenamento seguro e mantenha sua provenance; não os misture com fixtures de teste. O audit reporta cobertura `COMPLETE`, `PARTIAL`, `UNKNOWN`, dados expirados e game IDs problemáticos sem transformar ausência em fato.

## 6. Retenção e privacidade

Agende a limpeza pelo menos diariamente em um único scheduler por ambiente:

```bash
DATABASE_URL=postgresql://... npm run purge:expired
```

A rotina abre uma transação, remove idempotency keys expiradas, salas expiradas e sessões guest sem vínculo com sala ativa. FKs removem participantes, histórico, candidates, votos, matches e decisão por cascade. O comando emite contagens e eventos estruturados sem nickname ou token.

Defina separadamente a retenção de logs no provedor. Antes da publicação pública, registre finalidade, dados coletados, cookies necessários, analytics, compartilhamentos, canal de contato/exclusão e base legal validada pela organização responsável.

## 7. Observabilidade e alertas

Colete logs JSON preservando `requestId`, `service` e `environment`. Não reidrate campos marcados `[REDACTED]` em outro collector.

Métricas estruturadas disponíveis:

- tráfego, duração e erros HTTP;
- conexões/reconexões WebSocket e falhas de entrega;
- eventos publicados;
- duração, candidates e rejeições da recomendação;
- falhas de query;
- requests/erros do YouTube;
- linhas removidas pela retenção.

Alertas mínimos recomendados: readiness 503, aumento de 5xx, falhas de query, falhas de entrega realtime, saturação de conexões, latência de recomendação e erro do purge.

## 8. Rollback

- Frontend: reverta para o artefato estático anterior.
- API: mantenha compatibilidade com o schema já migrado e reverta o processo.
- Banco: não execute downgrade destrutivo automaticamente. Interrompa rollout, preserve backup e aplique uma migration corretiva revisada.
- Decision Data: imports são transacionais; para correção, aplique novo conjunto versionado com validade/provenance correta.

Depois do rollback, valide health/readiness, criação de sala, conexão WSS e refetch após reconexão.
