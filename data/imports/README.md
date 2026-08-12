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
