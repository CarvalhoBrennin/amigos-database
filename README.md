# AMIGOS Database

Aplicação web para um grupo criar uma sala anônima, declarar plataformas, acesso e preferências, votar de forma privada e chegar a uma decisão de jogo explicável. O catálogo legado, browser games e páginas de detalhes continuam disponíveis.

## Arquitetura

- `src/`: SPA React/Vite, TanStack Query, i18n e os fluxos de catálogo e sala.
- `shared/`: contratos Zod compartilhados entre web e API.
- `server/`: API Fastify, autenticação guest por cookie, CSRF, domínio de recomendação e realtime.
- `db/migrations/`: schema PostgreSQL, constraints, índices e referências versionadas.
- PostgreSQL: estado autoritativo de sessões, salas, candidatos, votos, matches e decisão.
- WebSocket: somente eventos server-to-client. Toda mutação usa REST; após reconexão o cliente refaz o snapshot REST.
- `LISTEN/NOTIFY`: distribui eventos entre instâncias da API conectadas ao mesmo PostgreSQL.

O motor de recomendação é puro e determinístico. Ele aplica filtros rígidos de jogadores, plataforma/pool de rede, acesso, multiplayer online, orçamento, duração e histórico; depois calcula score e materializa um snapshot auditável para a rodada. Dado desconhecido não é promovido a fato verificado.

## Pré-requisitos

- Node.js 22 ou superior;
- npm 10 ou superior;
- Docker com Compose, ou PostgreSQL 17 acessível por `DATABASE_URL`.

## Início local reproduzível

```bash
npm ci
docker compose up -d db
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

No PowerShell, substitua `cp .env.example .env` por:

```powershell
Copy-Item .env.example .env
```

A web abre em `http://localhost:5173` e a API em `http://localhost:3001`. O Vite encaminha `/api` e upgrades WebSocket para a API durante o desenvolvimento.

`db:seed` é idempotente e reaplica somente as referências versionadas de plataformas e planos. As migrations também incluem essa seed para instalações novas.

## Configuração

Variáveis públicas de build:

| Variável | Finalidade |
|---|---|
| `VITE_API_BASE_URL` | Origin HTTPS da API; vazio significa mesma origin. O WebSocket é derivado como `wss:`. |
| `VITE_SITE_URL` | URL canônica, Open Graph e sitemap. |
| `VITE_EXTERNAL_USD_TO_BRL` | Override opcional da conversão exibida no catálogo legado. Não é evidência de preço para a recomendação. |
| `VITE_REPOSITORY_URL` | Link institucional opcional. |

Variáveis exclusivas da API:

| Variável | Finalidade |
|---|---|
| `NODE_ENV`, `HOST`, `PORT` | Ambiente e bind HTTP. |
| `WEB_ORIGIN` | Allowlist explícita, separada por vírgulas, para CORS, CSRF e WebSocket. |
| `PUBLIC_WEB_URL`, `API_PUBLIC_URL` | Origins públicas da web e API. |
| `DATABASE_URL` | Conexão PostgreSQL. Produção exige TLS validável. |
| `SESSION_SECRET`, `TOKEN_PEPPER` | Segredos diferentes, aleatórios e com pelo menos 32 caracteres. |
| `ROOM_TTL_HOURS`, `GUEST_SESSION_TTL_HOURS` | Retenção configurável; padrão de 168 horas. |
| `MAX_ROOM_PARTICIPANTS`, `BODY_LIMIT_BYTES` | Limites operacionais. |
| `YOUTUBE_API_KEY` | Chave server-side opcional. Nunca use prefixo `VITE_`. |
| `YOUTUBE_CACHE_TTL_HOURS`, `YOUTUBE_NEGATIVE_CACHE_TTL_HOURS` | Cache positivo e negativo do provider. |
| `LOG_LEVEL` | Nível Pino. |

O arquivo `.env.example` contém todos os campos sem credenciais reais. `.env` não deve ser versionado.

## Decision Data

Dados reais de plataforma, crossplay, entitlement e preço precisam de proveniência HTTPS, região, validade e instante de verificação. Os exemplos em `data/imports/` são vazios de propósito; fixtures determinísticas existem somente em diretórios de teste.

```bash
npm run import:decision-data -- --file caminho/decision-data.json
npm run import:subscriptions -- --file caminho/subscriptions.json
npm run import:prices -- --file caminho/prices.json
npm run audit:decision-data
```

Os imports são dry-run por padrão. Para gravar após revisar o resumo:

```bash
npm run import:decision-data -- --file caminho/decision-data.json --apply
```

Cada aplicação é transacional e rejeita URL não HTTPS, enum desconhecido, período inválido e payload inconsistente. Não existe `--force`. Consulte `data/imports/README.md` e os schemas em `shared/contracts/`.

## Scripts principais

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia web e API. |
| `npm run dev:web` / `npm run dev:api` | Inicia um processo isolado. |
| `npm run db:migrate` | Aplica migrations versionadas. |
| `npm run db:seed` | Reaplica referências idempotentes. |
| `npm run purge:expired` | Exclui salas, sessões e idempotency keys expiradas; dependências caem por cascade. |
| `npm run check:i18n` | Confere paridade entre `pt`, `en`, `es`, `fr`, `hi` e `zh`. |
| `npm run lint` | Executa ESLint. |
| `npm run typecheck` | Verifica web, shared e API. |
| `npm run test:web` | Testes Vitest da SPA. |
| `npm run test:server` | Testes unitários de domínio/API. |
| `npm run test:integration` | Testes contra PostgreSQL real. |
| `npm run test:e2e` | Playwright multi-context. |
| `npm run test:coverage` / `test:server:coverage` | Cobertura web e server. |
| `npm run audit:ci` | Falha para vulnerabilidade `high` ou `critical`. |
| `npm run build` | Gera `dist/` e `dist-server/`. |
| `npm run check` | Gate local completo, inclusive integração. |

Antes de `test:integration`, `test:e2e` ou `check`, mantenha o PostgreSQL ativo e execute `npm run db:migrate`.

## Segurança, privacidade e retenção

- Cookie guest `HttpOnly`, `SameSite=Lax` e `Secure` em produção; tokens opacos são armazenados por hash.
- Mutações exigem Origin permitido e token CSRF; CORS nunca usa wildcard com credentials.
- Toda leitura/comando de sala revalida membership. Conhecer o código não concede acesso.
- REST e WebSocket têm rate limit, validação de payload e limites de tamanho.
- Nicknames são texto, não HTML; a UI não usa `dangerouslySetInnerHTML` para conteúdo externo.
- Logs estruturados removem cookie, authorization, CSRF, guest token, invite token e query de convite.
- Analytics recebe IDs pseudônimos e contagens, nunca nicknames, tokens, link de convite ou bibliotecas completas.
- O MVP coleta somente nickname, configuração de jogo, histórico da sala, votos e decisão. Não coleta e-mail, nome civil, telefone, localização precisa ou credenciais de plataforma.
- Salas e guest sessions expiram por configuração. Agende `npm run purge:expired`; a rotina transacional preserva sessão ainda ligada a uma sala ativa.

Antes de publicação pública, a organização responsável ainda precisa validar base legal, política de privacidade, prazo de logs, contato para titulares e contratos dos provedores. A implementação não presume uma base legal específica.

## Observabilidade

Toda resposta contém `X-Request-Id`. Pino produz logs JSON e a abstração de métricas emite eventos estruturados para HTTP, PostgreSQL, WebSocket, recomendação e YouTube. Eventos do funil cobrem criação, entrada, ready, start, candidate pool, voto, match, shortlist, gameplay, decisão e expiração.

Não há SaaS obrigatório: o destino inicial é o log estruturado e pode ser trocado por adapters sem alterar o domínio.

## Deploy

O frontend pode permanecer em hosting estático. A API precisa de processo Node persistente com suporte a WebSocket e PostgreSQL; não deve ser implantada como função efêmera sem uma estratégia realtime compatível.

O CSP versionado usa origins `.invalid` como bloqueio seguro. Antes de publicar, configure os origins exatos da API nos dois arquivos de headers:

```bash
npm run csp:configure -- --api-origin=https://api.seu-dominio.tld
```

Não publique enquanto `.invalid` permanecer no CSP. O procedimento completo, incluindo migrations, health checks, purge, rollback e previews, está em [docs/DEPLOY.md](docs/DEPLOY.md).

## Compatibilidade do catálogo

As rotas existentes de catálogo, browser games, detalhes, `/inicio`, filtros por URL, CheapShark e i18n permanecem. Preço convertido do catálogo legado é apenas informativo; decisões de acesso/orçamento usam exclusivamente `game_prices` com qualidade, proveniência e validade explícitas.
