# Full Ritual

> Cuidado em cinco dimensões. Pele, corpo, mente, dieta, espírito.
> *Constância em vez de urgência. Presença em vez de produtividade.*

Um app mobile-first de saúde integrada que cruza cinco eixos de cuidado ao dia real e usa IA para traduzir leituras rápidas em padrões.

---

## Visão de arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                          BROWSER                                │
│  Vite + React + TypeScript · CSS Variables · PWA · localStorage │
│  (zustand para estado · recharts para gráficos)                 │
└─────────────────────────┬───────────────────────────────────────┘
                          │ JWT do usuário
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SUPABASE                                   │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────────┐      │
│  │  Auth         │  │  Postgres     │  │  Storage        │      │
│  │  (email OTP)  │  │  (com RLS)    │  │  (avatars,      │      │
│  │               │  │               │  │   meals, skin)  │      │
│  └───────────────┘  └───────────────┘  └─────────────────┘      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Edge Functions (Deno)                                   │   │
│  │  ┌─────────────────┐    ┌──────────────────────┐         │   │
│  │  │  gemini-chat    │    │  regenerate-routine  │         │   │
│  │  │  (chave Gemini  │    │  (reordenação        │         │   │
│  │  │   fica AQUI)    │    │   clínica do skin)   │         │   │
│  │  └────────┬────────┘    └──────────────────────┘         │   │
│  └───────────┼──────────────────────────────────────────────┘   │
└──────────────┼──────────────────────────────────────────────────┘
               │ chave segura (Deno.env)
               ▼
       Google Gemini API
```

**Por que assim:** a chave do Gemini fica apenas em Secrets do Supabase, acessada via `Deno.env.get('GEMINI_API_KEY')` dentro da Edge Function. O navegador autentica o usuário via Supabase Auth, chama a função com o JWT, e a função consulta o Postgres com RLS para enriquecer o prompt com contexto recente do usuário antes de chamar o Gemini.

---

## Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Frontend | **Vite + React + TypeScript** | Build estático puro (perfeito pro Pages), TS pra segurança, React pra pool de devs grande quando contratar |
| Estado | **Zustand** + persist | Leve, hooks-native, sem boilerplate |
| Estilo | **CSS variables nativas** | Preserva o design system limpo, sem dependência de Tailwind/styled |
| Gráficos | **Recharts** | API declarativa, customizável o suficiente pra respeitar o DS |
| Backend | **Supabase** | Auth + Postgres + Storage + Edge Functions em uma plataforma, free generoso |
| IA | **Gemini via Edge Function** | Chave nunca vai ao browser |
| Deploy | **GitHub Actions + Pages** | Já configurado em `.github/workflows/deploy.yml` |
| Futuro mobile | **Capacitor** | Mesmo código vira iOS/Android nativo |
| Futuro pagamento | **Stripe via Edge Function** | Padrão Supabase, sem reescrever app |

---

## Setup local (15 minutos)

### 1. Pré-requisitos

```bash
node --version   # 20.x ou superior
pnpm --version   # 9.x ou superior
```

### 2. Instalar dependências

```bash
git clone https://github.com/<seu-usuario>/full-ritual.git
cd full-ritual
pnpm install
```

### 3. Configurar Supabase

Crie um projeto em [database.new](https://database.new). No SQL Editor, rode o conteúdo de `supabase/migrations/0001_initial_schema.sql` (cria todas as tabelas, RLS e buckets de Storage).

Pegue a URL e a anon key em **Settings → API** e crie `.env.local`:

```bash
cp .env.example .env.local
# edite com seus valores
```

### 4. Configurar a chave do Gemini

Pegue uma chave em [Google AI Studio](https://aistudio.google.com/apikey). Configure como secret no Supabase (via CLI ou Dashboard):

```bash
# CLI
npx supabase login
npx supabase link --project-ref <seu-project-ref>
npx supabase secrets set GEMINI_API_KEY=sua_chave_aqui

# OU Dashboard
# Vá em Functions → Secrets e adicione GEMINI_API_KEY
```

### 5. Deploy das Edge Functions

```bash
npx supabase functions deploy gemini-chat
npx supabase functions deploy regenerate-routine
```

### 6. Rodar localmente

```bash
pnpm dev
# abre em http://localhost:5173
```

---

## Deploy no GitHub Pages

### Uma vez só:

1. **Criar o repositório** no GitHub e fazer push do código.
2. Em **Settings → Pages**, definir Source = **GitHub Actions**.
3. Em **Settings → Secrets and variables → Actions**, adicionar:
   - `VITE_SUPABASE_URL` com a Project URL limpa, no formato `https://<project-ref>.supabase.co` (sem `/rest/v1`, `/auth/v1` ou outro caminho)
   - `VITE_SUPABASE_ANON_KEY`
4. Em `vite.config.ts`, ajustar `base` para o nome real do repo (ex: `/full-ritual/`).

### A cada push em `main`:

A action em `.github/workflows/deploy.yml` builda e publica automaticamente. O site fica em `https://<seu-usuario>.github.io/<repo>/`.

---

## Modelo de dados (resumo)

| Tabela | O que guarda | Cardinalidade típica |
|---|---|---|
| `profiles` | identidade, preferências, ciclo | 1 por usuário |
| `products` | cosméticos cadastrados | dezenas por usuário |
| `checkins` | check-in rápido (energia, calma, pele, corpo, sinais) | 1+ por dia |
| `sleep_logs` | hora de dormir, hora de acordar, qualidade | 1 por dia |
| `water_logs` | registro de água | múltiplos por dia |
| `meal_logs` | refeições com foto e humor pós | 3-5 por dia |
| `workout_logs` | treinos por modalidade | 0-2 por dia |
| `skincare_logs` | qual rotina foi feita, quando | 0-2 por dia |
| `mind_logs` | leitura, foco, meditação | múltiplos |
| `spirit_logs` | intenção, gratidões, tema | 1-2 por dia |
| `cycle_logs` | fase do ciclo, sintomas | 1 por dia (quando ativado) |
| `insights` | saídas da IA com correlações | 1 por dia + semanais |
| `ai_conversations` | histórico de chat | 1 por dia |

**Todas as tabelas têm RLS habilitado**: o usuário vê apenas o que é dele, via `auth.uid()`. A view `daily_scores` calcula score 0-100 por dimensão por dia, alimentando o calendário e os gráficos.

---

## Roadmap em quatro fases

### Fase 1 · Fundação (1-2 semanas)

- [x] Estrutura Vite + React + TS
- [x] Design system em CSS variables
- [x] Tab bar, Ring, MultiRing, PresenceSlider
- [x] Telas Home, Ritual, Insight, Dimension, Profile, Login
- [x] Schema Supabase completo com RLS
- [x] Workflow de deploy
- [ ] Conectar telas existentes a queries reais do Supabase
- [ ] Migrar dados do localStorage do protótipo antigo

### Fase 2 · IA real (1-2 semanas)

- [x] Edge Function `gemini-chat` com contexto enriquecido
- [x] Edge Function `regenerate-routine`
- [ ] Tela de chat IA com bubbles
- [ ] Cron job `weekly-insight` rodando aos domingos
- [ ] Card de insight na home se atualizando

### Fase 3 · Expansão (3-4 semanas)

- [ ] Tela de Produtos com CRUD e regeneração de rotina
- [ ] Painel de Sono detalhado
- [ ] Calendário-ciclo de 5 semanas com fases menstruais
- [ ] Gráfico de evolução de 30 dias
- [ ] Upload de foto da refeição e da pele
- [ ] Correlações automáticas (sono ↔ pele, treino ↔ sono, etc)

### Fase 4 · Monetização (quando decidir)

- [ ] Plano Free: 7 dias de histórico, 1 dimensão
- [ ] Plano Pro: histórico completo, IA ilimitada, correlações, export
- [ ] Stripe Checkout via Edge Function
- [ ] Capacitor para empacotar como app iOS/Android
- [ ] Submissão na App Store e Play Store

---

## Princípios não-negociáveis (do design system)

1. Mobile-first absoluto. Desktop é tolerado, nunca priorizado.
2. Máximo 3 toques para registrar qualquer coisa.
3. Cor de dimensão é semântica, nunca decorativa.
4. No máximo UMA cor de dimensão dominante por tela.
5. Sem streaks punitivos. Sem confete. Sem "Você perdeu seu streak!"
6. IA sempre opt-in e sempre visualmente legível como IA (fundo aubergine + ✦).
7. Nunca diagnóstico médico. A IA observa padrões, sugere ajustes, propõe pausas.
8. Tudo em português brasileiro, voz feminina implícita, sem formalismo.

---

## Estrutura de pastas

```
full-ritual/
├── .github/workflows/deploy.yml      # CI/CD para Pages
├── public/                            # estáticos
├── src/
│   ├── components/                    # Ring, TabBar, PresenceSlider
│   ├── screens/                       # Home, Ritual, Insight, Dimension, Profile, Login
│   ├── lib/                           # supabase, gemini (clientes)
│   ├── store/                         # zustand
│   ├── types/                         # tipos compartilhados
│   ├── styles/                        # tokens.css, global.css
│   ├── App.tsx
│   └── main.tsx
├── supabase/
│   ├── migrations/0001_initial_schema.sql
│   └── functions/
│       ├── gemini-chat/               # IA com contexto
│       └── regenerate-routine/        # reordenação de skincare
├── vite.config.ts
├── package.json
└── README.md (este arquivo)
```

---

## Scripts úteis

```bash
pnpm dev             # dev server local
pnpm build           # build de produção
pnpm preview         # serve o build local
pnpm typecheck       # checa tipos sem buildar
pnpm fn:deploy       # deploy das edge functions
pnpm db:push         # aplica migrations
```
