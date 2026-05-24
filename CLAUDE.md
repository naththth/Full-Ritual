# CLAUDE.md — Full Ritual

Guia para qualquer agente Claude trabalhando neste repositório. Leia antes de qualquer mudança.

---

## 1. Visão geral do produto

**Full Ritual** é um app mobile-first de saúde integrada que cruza cinco dimensões — **pele, corpo, mente, dieta, espírito** — em registros diários e usa IA contextual para devolver padrões ao usuário. Princípios:

- Constância em vez de urgência.
- Presença em vez de produtividade.
- A IA observa, não diagnostica.
- O dado é do usuário. Nada vai pra IA sem o usuário ter inputado.

PWA instalável, com Supabase como backend único (Auth + Postgres + Storage + Edge Functions).

---

## 2. Stack técnica

| Camada | Escolha |
|---|---|
| Frontend | Vite + React 18 + TypeScript (strict) |
| Estado global | Zustand + persist (`safeStringStorage`) |
| Roteamento | Estado interno (`screen` no store), não React Router |
| Estilo | CSS variables nativas (`src/styles/global.css`) |
| Gráficos | Recharts |
| Backend | Supabase (Auth email OTP, Postgres com RLS, Storage, Edge Functions Deno) |
| IA | Gemini, **exclusivamente** via Edge Functions |
| Testes | Vitest + React Testing Library + happy-dom |
| Deploy | GitHub Actions → Pages (base `/Full-Ritual/`) |

---

## 3. Estrutura de pastas

```
src/
  App.tsx              # bootstrap: sessão Supabase, perfil, onboarding gate
  main.tsx
  components/          # UI compartilhada (BackButton, NavigationMenu, Mandala, Ring...)
  screens/             # uma tela por arquivo; Home, Body, Mind, Diet, Spirit, Energy...
  store/useStore.ts    # store Zustand único (sessão, navegação, toast)
  lib/                 # supabase client, dates, cycle, storage helpers, gemini bridge,
                       # bodyMetrics, trainingPlan, reading, correlations, uploads
  data/                # conteúdo estático (ritualContent)
  types/index.ts       # tipos compartilhados (Profile, DimensionKey, CyclePhase, ...)
  styles/global.css    # design system
  test/setup.ts        # bootstrap dos testes
supabase/
  migrations/          # 0001..0025 incrementais
  functions/           # gemini-chat, body-coach, generate-training-plan,
                       # evaluate-workout, regenerate-routine, analyze-*,
                       # sync-garmin-vitals
```

---

## 4. Comandos úteis

```bash
npm install             # instalar dependências
npm run dev             # Vite dev server
npm test                # rodar Vitest (uma vez)
npm run test:watch      # watch mode
npm run typecheck       # tsc --noEmit
npm run lint            # eslint
npm run build           # tsc -b && vite build

npm run db:push         # supabase db push (migrations)
npm run fn:deploy       # supabase functions deploy (todas as funções listadas)
```

Supabase local opcional: `npx supabase start` / `npx supabase stop`. Não é obrigatório para desenvolvimento — o app degrada para modo offline se as env vars não estiverem definidas.

`.env.local` esperado:

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

Secret `GEMINI_API_KEY` é configurado **apenas no Supabase**, nunca no front.

---

## 5. Regras de TDD

- **Sempre criar teste antes** de qualquer mudança crítica em `lib/` (dates, cycle, storage, correlations, trainingPlan, bodyMetrics) e no store.
- **Nunca refatorar** funções de lógica de domínio sem antes ter teste mínimo que cubra o comportamento atual.
- Rodar `npm test` antes e depois de qualquer mudança não trivial.
- Telas grandes (Body, Mind, Diet) ainda não têm testes; quando for tocar lógica dentro delas, **extrair para `lib/`** e testar lá.
- Cobertura preferida: funções puras 100%, hooks de domínio com RTL, telas só smoke.

---

## 6. Regras de Supabase

- **Toda tabela com dado de usuário tem `user_id uuid not null references auth.users(id)`** (única exceção é `profiles`, que usa `id`).
- **RLS é obrigatório** em qualquer tabela nova. Policies sempre `auth.uid() = user_id` (ou `= id` em `profiles`). O bloco DO em `0001_initial_schema.sql` aplica isso automaticamente para tabelas conhecidas — para novas tabelas, replicar o padrão na migration que as cria.
- **Migrations são incrementais e imutáveis.** Nunca editar uma migration já aplicada. Sempre criar a próxima `00XX_descricao.sql`.
- Sempre filtrar queries no front com `.eq('user_id', userId)` mesmo com RLS — defesa em profundidade.
- Storage: buckets têm policies por pasta `auth.uid()::text` (ver `0004_storage_photo_policies.sql`).

---

## 7. Regras de IA

- **Gemini nunca no front-end.** Toda chamada passa por uma Edge Function em `supabase/functions/`.
- A chave `GEMINI_API_KEY` só existe em `Deno.env` do Supabase.
- O front chama a Edge Function com o JWT do usuário; a função valida, consulta o Postgres com RLS e monta o prompt.
- **IA não inventa dados.** Se o usuário não inputou, a IA não fala sobre. Prompts sempre incluem aviso explícito de não diagnosticar e não inferir além do registrado.
- **IA usa apenas dados inputados pelo usuário** (checkins, logs, exames anexados). Nunca usar dados externos não consentidos.
- Respostas da IA são **observações de padrão**, nunca prescrição.

---

## 8. Regras de saúde

- **Não diagnosticar.** Nem doenças, nem deficiências, nem condições.
- **Não substituir** médico, nutricionista, dermatologista ou psicólogo. Sempre que o sinal pedir, recomendar profissional.
- **Exames laboratoriais são referência informativa**, nunca interpretação clínica. A tela de Labs guarda o que o usuário anexou; a IA pode comentar tendência mas não conclusão.
- Linguagem: presença e cuidado, não prescrição. Evitar "você deve", "está errado", "tem que".
- Nada de comparações com "ideal" ou faixas normativas sem contexto. Sempre referenciar o histórico do próprio usuário.

---

## 9. Convenções de código

- **Componentes**: PascalCase, um por arquivo em `src/components/`. Stateless quando possível. Sem prop drilling: ler do store.
- **Hooks**: prefixo `use`, em `src/lib/use*.ts`. Devem ser puros e testáveis.
- **Services**: `src/lib/*.ts` sem React. Funções puras quando puderem ser. Lado-efeito (Supabase, fetch) isolado em funções nomeadas claramente.
- **Types**: tudo compartilhado em `src/types/index.ts`. Tipos locais ao arquivo ficam no próprio arquivo.
- **Telas**: `src/screens/*.tsx`, registradas em `App.tsx` via `screen === '...'`. Cada tela é autônoma; estado efêmero local, estado persistente no Supabase (via `lib/`) — não no store global.
- **Prompts de IA**: residem em `supabase/functions/*/index.ts`. Sempre incluem (a) instrução de não diagnosticar, (b) dados do usuário injetados via template, (c) tom presença-não-pressa.
- Sem emojis em código ou commits, salvo pedido explícito. Sem comentários explicativos do óbvio.

---

## 10. Plano macro das próximas fases

A ordem é deliberada — não pular etapa.

1. **Fase 0 — Auditoria + TDD + CLAUDE.md (atual).** Vitest configurado, smoke tests rodando, este documento, relatório de risco produzido.
2. **Fase 1 — Migração localStorage → Supabase.** Hoje 13 telas escrevem em `useLocalState`/`scopedStorageKey`. Migrar cada eixo (Energy, Spirit, Mind, Diet, Ritual, Products, Chat) para tabelas Supabase com `user_id` e RLS. Manter `localStorage` apenas como cache offline opcional.
3. **Fase 2 — Onboarding único e canônico.** Hoje `Onboarding.tsx` grava parte no Supabase e parte em `writeJson`. Tornar 100% Supabase, idempotente, e gate em `App.tsx` baseado em coluna `profiles.onboarding_completed_at`.
4. **Fase 3 — IA contextual real.** Edge Functions deixam de receber payload do front e passam a montar contexto via queries com RLS usando o JWT do chamador. Front só manda intent.
5. **Fase 4 — Eixo saúde (Labs, Pain, Vitals, Supplements).** Já há tabelas. Falta UI consistente e regras anti-diagnóstico no prompt.
6. **Fase 5 — Insights semanais + correlações.** Cron `0005_weekly_insight_cron` existe; cobrir com testes em `correlations.ts` e validar geração via Edge Function.
7. **Fase 6 — Endurecimento.** Logging estruturado, error boundary por tela, métricas básicas, política de retenção de fotos no Storage.

---

## Notas operacionais para o agente

- **Antes de tocar uma tela grande** (`Body.tsx` 1947 linhas, `Mind.tsx` 1040, `Home.tsx` 979, `Diet.tsx` 959): leia inteiro ou faça grep dirigido. Não confie em achar a chamada certa só pelo nome.
- **`hasSupabase` é false em dev sem `.env.local`.** O app degrada para localStorage. Isso é intencional, mas testes de integração com Supabase precisam de env real.
- **`useLocalState` ainda é a fonte de verdade** para a maioria dos eixos diários. Não remover sem migração planejada (Fase 1).
- Migrations já vão até `0029_skin_phase4.sql`. Próxima é `0030_*`.
- **Dimensão Pele** usa tela `Skin.tsx` (não mais `Ritual.tsx`). A navegação `dimension:skin` → `screen: 'skin'` está no store. `Ritual.tsx` permanece para retrocompatibilidade de outros pontos que ainda o referenciam.
- **IA CARE**: Edge Function em `supabase/functions/ia-care/`. Nunca chamar Gemini diretamente do front. Sempre usar `generateSkinRoutine()` de `src/lib/skinRoutineService.ts`.

---

## 11. IA CARE — regras permanentes

- **IA CARE não é dermatologista.** Não diagnostica, não prescreve, não altera prescrição médica, não promete cura.
- **Dados reais apenas.** A IA CARE só usa dados explicitamente cadastrados pelo usuário em `skin_profiles` e `skin_products`. Nunca inventar produtos, alergias, diagnósticos ou histórico.
- **Modo conservador obrigatório** quando houver: rosácea, sensibilidade alta, alergias, gestação, lactação, tentativa de engravidar, uso de retinoides, ácidos ou prescrição médica.
- **Aromas são ritual sensorial**, nunca tratamento dermatológico. Nunca sugerir aroma diretamente no rosto de pele sensível/rosácea.
- **Retinoides contraindicados** em gestação/lactação sem orientação médica.
- **Protetor solar obrigatório** na rotina diurna do rosto quando houver perfil facial.
- **Prompt interno** reside em `supabase/functions/ia-care/prompt.ts`. Não duplicar regras no front.
- **Hierarquia**: Segurança dermatológica → dados reais → simplicidade/adesão → objetivos → ritual sensorial.
- Edge Function `ia-care` valida JWT, lê `user_id` da sessão (nunca do body), busca perfil e produtos do banco, persiste rotina em `skin_routines` + `skin_routine_items`, loga em `skin_ai_logs`.

---

## Agent skills

### Issue tracker

Issues are tracked in Trello (no board URL yet). See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
