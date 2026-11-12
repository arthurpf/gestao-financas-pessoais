# 💰 Gestão de Finanças Pessoais

Aplicativo **desktop**, gratuito e **100% local**, para organizar suas finanças pessoais: lançamentos, cartões de crédito, etiquetas, gráficos mensais e importação/exportação de dados. Seus dados ficam no seu computador, em um banco SQLite, sem nuvem, sem cadastro e sem enviar nada para ninguém.

> Status: em desenvolvimento inicial (versão `0.1.0`).

---

## Sumário

- [Por que este projeto existe](#por-que-este-projeto-existe)
- [O que ele faz](#o-que-ele-faz)
- [Stack](#stack)
- [Como rodar](#como-rodar)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Como contribuir](#como-contribuir)
- [Ideias e próximos passos](#ideias-e-próximos-passos)
- [Licença](#licença)

---

## Por que este projeto existe

Saber para onde vai o próprio dinheiro é o primeiro passo para ter controle sobre a própria vida. Quem enxerga suas receitas, despesas e dívidas com clareza toma decisões melhores, planeja o futuro com mais tranquilidade e sofre menos com surpresas no fim do mês.

Mesmo assim, boas ferramentas de gestão financeira costumam ser pagas, exigir que você entregue seus dados bancários a terceiros, ou ser complicadas demais para quem só quer começar. Isso deixa de fora justamente quem mais se beneficiaria delas.

Este projeto nasceu para **democratizar o acesso a uma ferramenta de gestão pessoal**. A ideia é que qualquer pessoa possa:

- **Ter clareza** sobre sua situação financeira, sem precisar entender de finanças ou de planilhas.
- **Manter a privacidade**: os dados ficam no seu computador e ninguém mais tem acesso a eles.
- **Não depender de assinatura, conta ou internet** para cuidar do próprio dinheiro.
- **Ser dona ou dono dos seus dados**: tudo pode ser exportado e restaurado a qualquer momento, em formato aberto (CSV).
- **Contribuir e adaptar**: o código é aberto, então qualquer pessoa pode melhorar a ferramenta para si e para os outros.

Mais do que um app de planilhas bonitas, a intenção é dar às pessoas mais autonomia sobre suas escolhas.

---

## O que ele faz

| Área | O que você consegue fazer |
| --- | --- |
| 📊 **Dashboard** | Resumo mensal em gráficos (receitas, despesas e diferença; despesas empilhadas por fonte; evolução por cartão com linha do limite) e extrato do mês com navegação entre meses. |
| 🧾 **Lançamentos** | Cadastrar, editar e consultar receitas e despesas, mês a mês, ligadas a contas, cartões e etiquetas. |
| 🔄 **Importar/Exportar** | Importar extratos em **CSV** com mapeamento de colunas, escolha de delimitador, formato de data e de número, e pré-visualização antes de confirmar. Exportar todos os dados e restaurar um backup. |
| 💳 **Cartões de crédito** | Cadastrar cartões com limite, dia de vencimento e melhor dia de compra. |
| 🏷️ **Etiquetas** | Criar etiquetas coloridas para classificar lançamentos do jeito que fizer sentido para você. |
| ⚙️ **Configurações** | Tema claro/escuro e opção de apagar todos os dados (com confirmação). |

Detalhes que valem destaque:

- Valores são guardados em **centavos (inteiros)**, evitando erros de arredondamento.
- Ao importar CSV, linhas inválidas (data ou valor ausente, por exemplo) são tratadas e sinalizadas na pré-visualização. O arquivo `teste-importacao.csv` na raiz traz um exemplo com casos felizes e problemáticos para testar.
- O banco usa **migrações versionadas**, então atualizações do app preservam os dados existentes.
- Na primeira execução, uma **"Conta Principal"** é criada automaticamente para você já poder começar.

---

## Stack

- [Electron](https://www.electronjs.org/) (app desktop) com [electron-vite](https://electron-vite.org/) e [Vite](https://vite.dev/)
- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) na interface
- [Recharts](https://recharts.org/) para os gráficos
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) para o banco de dados local
- [electron-builder](https://www.electron.build/) para gerar o instalador (hoje configurado para Windows x64)

Os dados ficam no arquivo `finances.db`, dentro da pasta de dados do usuário do Electron (`userData`). No Windows, fica em `%APPDATA%`, dentro de uma pasta com o nome do app (`gestao-financas-pessoais` em desenvolvimento e `GestaoFinancasPessoais` na versão instalada).

---

## Como rodar

### Pré-requisitos

- [Node.js](https://nodejs.org/) em uma versão LTS recente
- npm (já vem com o Node.js)
- Ferramentas de compilação nativa, caso o `better-sqlite3` precise ser compilado na sua máquina (no Windows, as *Visual Studio Build Tools* com a carga de trabalho "Desenvolvimento para desktop com C++")

### Passo a passo

```bash
# 1. Clone o repositório
git clone <url-do-repositorio>
cd gestao-financas-pessoais

# 2. Instale as dependências (o postinstall prepara os módulos nativos para o Electron)
npm install

# 3. Rode em modo de desenvolvimento, com hot reload
npm run dev
```

### Scripts disponíveis

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Abre o app em modo de desenvolvimento. |
| `npm run build` | Gera o build de produção em `out/`. |
| `npm run build:win` | Gera o build e o instalador Windows (NSIS) em `dist/`. |
| `npm run typecheck` | Verifica os tipos do processo principal e da interface. |

---

## Estrutura do projeto

```
src/
├── main/                    # Processo principal do Electron (Node.js)
│   ├── index.ts             # Cria a janela, abre o banco e registra os handlers
│   ├── db/
│   │   ├── connection.ts    # Conexão SQLite (WAL, foreign keys)
│   │   ├── migrations/      # Migrações numeradas (001_init, 002_..., etc.)
│   │   └── repositories/    # Acesso ao banco: consultas SQL por entidade
│   └── ipc/                 # Handlers IPC que expõem os repositórios à interface
├── preload/                 # Ponte segura (contextBridge) entre main e interface
└── renderer/                # Interface React
    └── src/
        ├── pages/           # Dashboard, Transactions, ImportExport, CreditCards, Labels, Settings
        ├── components/      # Sidebar, MonthPicker, LabelBadge, ...
        ├── lib/             # Utilitários: parser de CSV, importação, backup, cores
        ├── styles/          # Tema (claro/escuro)
        └── types/ipc.ts     # Tipos compartilhados da API exposta pelo preload
```

### Como os dados fluem

A interface **não acessa o banco diretamente**. O caminho é sempre:

```
Página React → window.api.* (preload) → handler IPC (main/ipc) → repositório (main/db/repositories) → SQLite
```

O app roda com `contextIsolation` ligado, `nodeIntegration` desligado e `sandbox` ativado, então toda comunicação com o sistema passa pela API explícita do preload.

---

## Como contribuir

Contribuições são muito bem-vindas, de código, de ideias, de testes, de textos ou de design. Se você é iniciante, ajudar a deixar o app mais claro e acessível para quem não é da área financeira já é uma ótima contribuição.

### Fluxo sugerido

1. **Abra uma issue** (ou comente em uma existente) descrevendo o bug ou a ideia, antes de começar mudanças grandes. Assim evitamos trabalho duplicado.
2. **Faça um fork** do repositório e crie uma branch a partir da principal, com um nome descritivo:
   ```bash
   git checkout -b feat/orcamento-mensal
   ```
3. **Desenvolva** seguindo as convenções abaixo e teste manualmente com `npm run dev`.
4. **Verifique os tipos** antes de enviar:
   ```bash
   npm run typecheck
   ```
5. **Faça commits pequenos e claros**, de preferência com mensagens no imperativo (por exemplo: `Adiciona filtro por etiqueta nos lançamentos`).
6. **Abra um Pull Request** explicando o que mudou, por quê, e como testar. Prints ou GIFs ajudam bastante em mudanças visuais.

### Convenções e dicas

- **Idioma**: a interface do app é em português do Brasil. Mantenha textos de tela, mensagens de erro e acentuação consistentes.
- **Dinheiro**: sempre em **centavos inteiros** no banco e na lógica (`amount_cents`). Converta para reais só na hora de exibir.
- **Banco de dados**: nunca edite uma migração já existente. Para mudar o esquema, crie uma nova migração em `src/main/db/migrations/` (por exemplo `006_nome.ts`, exportando `sql`) e registre-a na lista de `migrations/index.ts`. Use `IF NOT EXISTS` quando fizer sentido.
- **Nova funcionalidade com dados** costuma envolver, nesta ordem: migração → repositório → handler IPC (registrado em `ipc/index.ts`) → exposição no `preload/index.ts` → tipos em `renderer/src/types/ipc.ts` e `preload/index.d.ts` → página ou componente React.
- **Privacidade primeiro**: o app é local por princípio. Mudanças que enviem dados para fora da máquina (telemetria, sincronização em nuvem, etc.) precisam ser discutidas antes em uma issue e, se aceitas, devem ser opcionais e explícitas para o usuário.
- **Segurança**: mantenha `contextIsolation`, `sandbox` e a ausência de `nodeIntegration`. Valide entradas que chegam via IPC.
- **Acessibilidade**: use rótulos (`aria-label`), contraste adequado nos dois temas e navegação por teclado nos componentes novos.
- **Dados de teste**: nunca inclua dados financeiros reais em issues, PRs ou arquivos de exemplo. Use dados fictícios, como os do `teste-importacao.csv`.

### Onde pedir ajuda

Não tem certeza de por onde começar? Abra uma issue com a pergunta, sem problema nenhum. Toda dúvida ajuda a melhorar este README.

---

## Ideias e próximos passos

Algumas direções que fazem sentido para o projeto (sugestões, não promessas):

- Orçamentos e metas por categoria
- Lançamentos recorrentes e parcelados
- Faturas de cartão de crédito (fechamento e vencimento)
- Mais formatos de importação (OFX e outros)
- Testes automatizados
- Instaladores para macOS e Linux
- Internacionalização

---

## Licença

O `package.json` declara a licença **ISC**. Antes de aceitar contribuições externas, vale adicionar um arquivo `LICENSE` na raiz com o texto completo da licença escolhida.

---

<p align="center">Feito com a crença de que ter controle sobre o próprio dinheiro é ter mais liberdade sobre a própria vida.</p>
