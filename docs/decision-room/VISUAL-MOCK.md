# Mock visual da sala

O projeto inclui uma sala local estática para revisar o layout sem criar dados
no banco ou abrir várias sessões do navegador.

- URL: `http://localhost:5173/room/mock`
- Estados disponíveis: Lobby, Votação, Finalistas e Concluída.
- Use **Simular sessão** para assistir a uma sessão completa de Bia + Rafa: entrada,
  confirmação do segundo participante, abertura da votação, votos sequenciais e
  resultado final. A linha do tempo dura cerca de cinco segundos e pode ser
  reiniciada quantas vezes for necessário.
- O mock não chama a API e não cria participantes reais.

Para remover o mock, apague `src/pages/RoomVisualMockPage.tsx`, remova o import
lazy e o `Route` correspondente em `src/App.tsx`. O restante do fluxo não depende
dele.
