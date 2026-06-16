# AMIGOS Database

Catálogo SPA de jogos cooperativos e jogos web, com filtros, i18n, modais acessíveis, redirect de `/inicio` para `/` e integração de preços com CheapShark convertidos para BRL na interface.

## Visão geral

Catálogo de jogos cooperativos e browser games em SPA estática, com filtros, i18n, modais e integração de preços.

## Destaques

- catálogo de jogos com navegação SPA
- i18n com múltiplos idiomas (interface traduzida; conteúdo editorial dos jogos atualmente em PT)
- filtros e modais acessíveis
- integração com CheapShark para preços
- páginas de browser games e fichas detalhadas
- testes unitários, de cobertura e E2E
- políticas de segurança para deploy estático

## Stack

- React 18
- TypeScript
- Vite 6
- Tailwind CSS 3
- Zustand
- i18next
- Framer Motion
- Vitest + Testing Library + vitest-axe
- Playwright

## Quickstart

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Desenvolvimento local |
| `npm run typecheck` | Verificação TypeScript |
| `npm run lint` | Lint |
| `npm run check:i18n` | Paridade de chaves entre idiomas |
| `npm run sitemap` | Gera `public/sitemap.xml` (executado automaticamente no `prebuild`) |
| `npm run audit:ci` | Auditoria de dependências (`--audit-level=high`) |
| `npm run test:run` | Testes unitários e integração |
| `npm run test:coverage` | Cobertura |
| `npm run test:e2e` | Fluxos E2E |
| `npm run build` | Build de produção |
| `npm run check` | Gate completo |

## Qualidade

Critérios de qualidade já previstos no projeto:

- `npm run check`
- `npm run test:e2e`
- `npm run audit:ci`

Cobertura mínima configurada:

- `statements >= 80`
- `lines >= 80`
- `functions >= 75`
- `branches >= 70`

## i18n

- idiomas suportados: `pt`, `en`, `es`, `fr`, `hi`, `zh`
- validação de chaves em `scripts/check-i18n-keys.mjs`
- carregamento lazy em `src/i18n.ts`
- conteúdo editorial dos jogos: apenas `games.editorial.pt.json` por enquanto; outros idiomas usam fallback PT na UI

## Configuração opcional

- `VITE_SITE_URL`: URL canônica do site (canonical, Open Graph, sitemap). Default: `https://amigos-database.vercel.app`
- `VITE_EXTERNAL_USD_TO_BRL`: taxa usada para converter preços externos da CheapShark para BRL na interface. Default: `5.5`
- `VITE_REPOSITORY_URL`: URL do repositório exibida no footer. Se não for definida, o link institucional fica oculto

## Deploy

Fluxo recomendado:

```bash
npm run check
npm run build
```

Publicação:

- publicar `dist/` em host estático
- garantir fallback SPA para `index.html`
- definir `VITE_SITE_URL` no ambiente de build para canonical e sitemap corretos
- manter `vercel.json` ou `public/_headers` quando aplicável

O `sitemap.xml` é gerado no `prebuild` e copiado para `dist/`; não é versionado no git.

Guia resumido: [docs/DEPLOY.md](docs/DEPLOY.md)

## Observação sobre mídia local

O fundo animado usa os frames em `public/wallpaper/frame-1.png` … `frame-4.png`. Para reimportar catálogos a partir de JSON externos, coloque os arquivos em `public/` e execute `node scripts/import-game-data.mjs` (veja caminhos no script).

## Publicação

Coverage, builds e artefatos locais ficam fora do versionamento.
