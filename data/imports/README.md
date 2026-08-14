# Importação de Decision Data

Este diretório contém somente contratos de exemplo. Nenhum arquivo daqui é carregado automaticamente.

Os dados usados por filtros rígidos precisam ter proveniência verificável, URL HTTPS, região, plataforma, período de validade e horário de verificação. Não transforme o preço legado do catálogo, resultados de busca ou suposições sobre crossplay em dados verificados.

Comandos:

```text
npm run import:decision-data -- --file <path>
npm run import:subscriptions -- --file <path>
npm run import:prices -- --file <path>
```

Todos executam apenas validação (dry-run) por padrão. Acrescente `--apply` para gravar, sempre em uma transação. A opção `--force` não existe de propósito.

Os arquivos de exemplo usam listas vazias para não introduzir fatos fictícios. Um arquivo real deve seguir os schemas Zod em `shared/contracts/decision-data.ts` e `shared/contracts/subscription.ts`.

## Pesquisa automática (multi-fonte + IA local)

`npm run research:games` percorre o catálogo, coleta evidências de cinco fontes públicas, concilia os campos objetivos e usa um modelo local (Ollama) para escrever um dossiê e pontuar os eixos subjetivos, revisando o próprio texto até passar na crítica.

Flags: `--limit N`, `--game-id ID`, `--refresh` (refaz jogos que já têm perfil, exceto `COMPLETE`), `--apply` (grava no banco a cada jogo), `--max-rounds N` (padrão 3), `--redo` (ignora dossiês já existentes), `--out DIR`.

Fontes consultadas por jogo:

| Fonte | O que fornece | Chave |
| --- | --- | --- |
| Steam `appdetails` | modelo (F2P/pago), gêneros, categorias, requisitos, tamanho de instalação | não |
| Steam `appreviews` | sentimento agregado e trechos reais de avaliações | não |
| PCGamingWiki (Cargo `Multiplayer`) | jogadores local/LAN/online, crossplay | não |
| PCGamingWiki (Cargo `Infobox_game`) | gêneros, modos, série | não |
| Wikidata (SPARQL `P1872`/`P1873`) | mínimo/máximo de jogadores | não |
| Catálogo interno | faixa de jogadores, duração de sessão, tags, texto editorial | — |

Saídas em `data/imports/research-output/` (git-ignorado):

- `dossiers/<id>-<slug>.md` — dossiê por jogo: visão geral, dinâmica em grupo, justificativa dos eixos, acesso/requisitos, ressalvas, tabela de dados objetivos com origem, links das fontes e o histórico de auto-revisão.
- `<timestamp>-audit-report.md` — auditoria campo a campo: `✓ concordam`, `⚠ CONFLITO` (fontes divergiram; registra qual venceu e por quê), `· fonte única`, `· indisponível`, `✦ julgamento do modelo`.
- `<timestamp>-decision-data.json` — arquivo no contrato de `import:decision-data`.

Limites que a ferramenta respeita de propósito:

- O perfil é sempre gravado como `PARTIAL`. Promover para `COMPLETE` continua sendo decisão humana, porque exige fonte e verificação sob o critério de quem opera.
- Campo sem fonte fica nulo; a ferramenta nunca preenche lacuna com suposição.
- Eixos, dificuldade e tier de PC são **julgamento do modelo**, não fato verificado, e aparecem marcados assim na auditoria e no dossiê.
- Duração de sessão vem só do catálogo interno — não existe fonte externa estruturada para isso.

Requer Ollama rodando (`OLLAMA_URL`, padrão `http://localhost:11434`) com o modelo de `OLLAMA_MODEL` (padrão `qwen3:8b`) já baixado; `OLLAMA_NUM_CTX` ajusta o contexto (padrão 8192). Jogos sem app id da Steam identificável são pulados e listados no relatório final.
