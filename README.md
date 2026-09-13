# Fluxo — administrador de atividades

Aplicação web local para cadastrar atividades, controlar prioridades e acompanhar prazos.

## Executar

Requer Node.js 22.5 ou mais recente.

```bash
npm start
```

Abra `http://localhost:3000` no navegador. Os dados são armazenados localmente no arquivo `tarefas.db`, criado na primeira execução.

Durante o desenvolvimento, use `npm run dev` para reiniciar o servidor automaticamente após alterações.

## Recursos

- Cadastro e edição de título, descrição, prazo e prioridade
- Datas automáticas de criação e conclusão
- Conclusão e reabertura de atividades
- Identificação de tarefas atrasadas
- Busca e filtros por status e prioridade
- Exclusão com confirmação
- Interface responsiva para celular e computador
