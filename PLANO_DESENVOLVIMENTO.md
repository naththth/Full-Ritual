# Plano de Desenvolvimento — Full Ritual

Plano executável a partir do relatório de risco da Fase 0. Cada fase tem **objetivo claro, escopo fechado, TDD obrigatório e critério de pronto**. Não pular ordem — cada fase remove uma dívida que a próxima exige.

> **Regra de ouro:** nenhuma fase começa sem teste pinning do comportamento atual. Nenhuma fase termina sem `npm test`, `npm run typecheck` e `npm run build` verdes.

---

## Fase 0 — Auditoria + TDD + CLAUDE.md ✅ CONCLUÍDA

- Vitest + RTL + happy-dom configurados
- 18 testes rodando (`dates`, `cycle`, `storage`, `useStore`)
- `CLAUDE.md` criado
- Relatório de risco entregue

---

## Fase 1 — Migração `localStorage` → Supabase

**Objetivo:** mover todo dado do usuário para Supabase, eixo por eixo. `localStorage` permanece **somente como cache offline opcional**, nunca como fonte de verdade.

**Por que primeiro:** sem isso, troca de dispositivo perde tudo. É o risco mais alto identificado.

### Padrão de migração (aplicar igual em cada eixo)

Para cada eixo, em ordem:

1. **Pinning test** — criar teste que congela o comportamento atual de leitura/escrita via `useLocalState`.
2. **Service Supabase** — criar `src/lib/<eixo>Service.ts` com funções puras: `load(userId, date)`, `save(userId, date, payload)`, `list(userId, range)`. Sempre `.eq('user_id', userId)` mesmo com RLS.
3. **Teste do service** — mockar `supabase` e validar query/payload, incluindo `user_id`.
4. **Hook de bridge** — `useEixoDay(userId, date)`: lê do Supabase, expõe `setX` que debounce e persiste. Mantém shape idêntico ao `useLocalState` para não quebrar a tela.
5. **Swap na tela** — substituir `useLocalState` pelo hook novo. Teste de smoke da tela.
6. **Cache offline (opcional)** — manter `localStorage` apenas como camada de leitura otimista; truth = Supabase.
7. **Limpeza** — remover keys obsoletas via migration de cliente (one-shot, idempotente).

### Ordem dos eixos (do menos arriscado ao mais)

| # | Eixo | Tela | Tabelas alvo | Migrations |
|---|---|---|---|---|
| 1 | **Spirit** | `Spirit.tsx` | `spirit_logs` | 0001 ✅ |
| 2 | **Energy** | `Energy.tsx` | `checkins`, `sleep_logs`, `cycle_logs` | 0001 ✅ |
| 3 | **Mind** | `Mind.tsx` | `mind_logs`, `reading_books`, `reading_sessions` | 0001, 0006 ✅ |
| 4 | **Diet** | `Diet.tsx` | `meal_logs`, `diet_plans` | 0001, 0022 ✅ |
| 5 | **Ritual (skin)** | `Ritual.tsx` | `skincare_logs` + Storage de fotos | 0001, 0004 ✅ |
| 6 | **Products** | `Products.tsx` | `products` | 0001 ✅ |
| 7 | **Body (treino)** | `Body.tsx` | `workout_logs`, `workout_loads` | 0001, 0012 ✅ |
| 8 | **Chat** | `Chat.tsx` | `ai_conversations` | 0001 ✅ |
| 9 | **Library** | `Library.tsx` | `reading_*` | 0006 ✅ |
| 10 | **Home agregador** | `Home.tsx` | nenhuma nova — passa a ler dos services | — |

**Body é por último porque tem 1947 linhas.** Antes de migrar Body, extrair lógica em `lib/`.

### Critério de pronto da Fase 1

- [ ] `grep "useLocalState\|writeJson\|readJson" src/screens/` retorna 0 ocorrências
- [ ] Cada eixo tem service testado com `user_id` validado
- [ ] App em dispositivo B mostra os mesmos dados que dispositivo A após login
- [ ] Modo offline mostra banner "sem conexão — dados podem não sincronizar"

---

## Fase 2 — Onboarding único e canônico

**Objetivo:** onboarding 100% Supabase, idempotente, gate único e confiável.

**Por que agora:** sem Fase 1, onboarding continua híbrido. Com Fase 1 pronta, é só fechar a porta.

### Tarefas

1. **Migration `0026_profile_onboarding_state.sql`**
   - `profiles.onboarding_completed_at timestamptz`
   - `profiles.onboarding_step text` (opcional, para retomar)
   - backfill: `update profiles set onboarding_completed_at = now() where skin_type is not null or sport_modalities is not null`
2. **Refactor `Onboarding.tsx`**
   - Remover qualquer `writeJson`
   - Cada step grava no `profiles` direto, com `.upsert`
   - Step final marca `onboarding_completed_at = now()`
3. **Gate em `App.tsx`**
   - Trocar `!profile?.skin_type && !profile?.sport_modalities?.length` por `!profile?.onboarding_completed_at`
4. **Testes**
   - Service `profileService.ts` com `markOnboardingComplete`
   - Componente: render de Onboarding com profile null vs completo
5. **Teste de regressão manual** — usuário com profile parcial (skin_type sem sport_modalities) deve cair em onboarding correto.

### Critério de pronto

- [ ] Coluna criada e backfill rodado
- [ ] `App.tsx` gate baseado em `onboarding_completed_at`
- [ ] Nenhum `writeJson` em `Onboarding.tsx`
- [ ] Trocar de dispositivo no meio do onboarding retoma do mesmo step

---

## Fase 3 — IA contextual no servidor

**Objetivo:** Edge Functions param de receber contexto do front. Front envia intent + IDs. Função monta contexto via SQL com JWT do usuário (RLS faz o resto).

**Por que agora:** sem Fases 1+2, não há contexto centralizado no banco para a função ler. Agora há.

### Tarefas

1. **Inventário** — listar payloads atuais de cada Edge Function:
   - `gemini-chat`, `body-coach`, `regenerate-routine`, `generate-training-plan`, `evaluate-workout`, `analyze-body-photo`, `analyze-body-progress`, `analyze-lab-photo`, `sync-garmin-vitals`
2. **Padrão de prompt** — criar `supabase/functions/_shared/promptGuard.ts`:
   - Header obrigatório anti-diagnóstico
   - Header de presença-não-pressa
   - Aviso "não inventar dados — usar somente contexto fornecido"
3. **Refactor por função:**
   - Front envia `{ intent, references: { date?, log_id? } }`
   - Função usa `createClient` com JWT do chamador → queries com RLS
   - Função monta prompt determinístico
   - Resposta validada (não menciona diagnóstico, não recomenda dose, não compara a faixa "normal")
4. **Testes** — para cada função, suite Deno que:
   - Recusa chamada sem JWT
   - Recusa cross-user (tenta ler dado de outro user → falha)
   - Bloqueia respostas com palavras-gatilho ("diagnóstico", "doença X", "deficiência de Y")
5. **Telemetria** — log estruturado de cada chamada (sem PII): user hash, intent, tokens, latência.

### Critério de pronto

- [ ] Nenhuma Edge Function aceita payload com dados de log no body — só IDs
- [ ] Todas as funções carregam contexto via RLS com JWT
- [ ] `promptGuard` aplicado em 100% das funções
- [ ] Testes Deno passando em CI

---

## Fase 4 — Eixo saúde (Labs, Pain, Vitals, Supplements)

**Objetivo:** UI consistente para o eixo saúde + regras anti-diagnóstico no prompt.

**Por que agora:** tabelas já existem (`0017`..`0020`), mas a UI é desigual e o prompt da IA não está endurecido. Pós-Fase 3, prompt guard está pronto.

### Tarefas

1. **Auditar telas** — `Labs.tsx`, `Pain.tsx`, `Supplements.tsx`, `Vitals.tsx`, `Health.tsx`. Identificar inconsistências de design.
2. **Padronizar componentes** — extrair `<MetricCard>`, `<TimelineEntry>`, `<PhotoAttach>` para `components/health/`.
3. **Linguagem** — varredura por termos proibidos ("diagnóstico", "normal", "ideal", "deficiência", "você deve"). Substituir por linguagem de presença.
4. **IA do eixo saúde** — Edge Function `health-coach` (nova) com guard reforçado: comenta tendência, nunca conclusão.
5. **Disclaimer visual permanente** — banner inferior nas telas de saúde: "Referência informativa. Não substitui profissional."
6. **Testes** — `correlations.test.ts`, `bodyMetrics.test.ts`, validação de linguagem dos prompts.

### Critério de pronto

- [ ] 5 telas com mesmo design system
- [ ] Zero ocorrências de termos proibidos em prompts e copy
- [ ] Banner anti-diagnóstico presente em todas as telas de saúde
- [ ] Cobertura de testes ≥ 80% em `lib/bodyMetrics.ts` e `lib/correlations.ts`

---

## Fase 5 — Insights semanais e correlações

**Objetivo:** cron de insight semanal funcionando ponta a ponta, com correlações testadas.

**Por que agora:** depende de dados consistentes (Fases 1+2) e de prompt seguro (Fase 3).

### Tarefas

1. **Testar `lib/correlations.ts`** — pinning + edge cases (poucos dados, dados ausentes, outliers).
2. **Validar `0005_weekly_insight_cron.sql`** — verificar agenda, função alvo, idempotência.
3. **Edge Function `weekly-insight`** — refactor para usar promptGuard + dados via RLS.
4. **Tela `Insight.tsx`** — render do último insight, histórico, sem permitir trigger manual fora de janela.
5. **Teste end-to-end** — seed de 7 dias → executar função → conferir insight no banco.
6. **Notificação** — opcional: push web quando insight estiver pronto.

### Critério de pronto

- [ ] `correlations.ts` com cobertura ≥ 90%
- [ ] Cron dispara automaticamente uma vez por semana por usuário ativo
- [ ] Insight gerado sem termos proibidos
- [ ] Tela mostra insight da semana corrente + 4 anteriores

---

## Fase 6 — Endurecimento

**Objetivo:** observabilidade, resiliência, política de dados.

### Tarefas

1. **Error Boundary por tela** — substituir o único `ErrorBoundary.tsx` global por wrapper por screen, com fallback que não derruba navegação.
2. **Logging estruturado** — wrapper `lib/log.ts` que envia para Supabase (`app_events` nova tabela) eventos chave: login, save, ai_call, error.
3. **Métricas básicas** — tela admin (própria conta) mostrando: dias logados, taxa de save com erro, latência média de IA.
4. **Retenção de fotos** — política de Storage: fotos antigas (>180 dias) movidas para bucket frio ou marcadas para revisão pelo usuário.
5. **Modo offline real** — service worker já existe (PWA). Adicionar fila de writes pendentes que sincroniza quando a rede voltar.
6. **CI** — GitHub Action rodando `typecheck`, `lint`, `test`, `build` em todo PR.

### Critério de pronto

- [ ] PR sem CI verde não merge
- [ ] Erros no front geram evento em `app_events`
- [ ] Fila offline reenvia writes pendentes ao reconectar
- [ ] Política de fotos documentada e implementada

---

## Resumo visual

```
Fase 0 ✅  → infra de teste, CLAUDE.md, relatório
Fase 1     → localStorage some, Supabase é fonte de verdade
Fase 2     → onboarding único, gate confiável
Fase 3     → IA roda com contexto do servidor, prompt guard
Fase 4     → eixo saúde consistente e anti-diagnóstico
Fase 5     → insights semanais ponta a ponta
Fase 6     → observabilidade, offline real, CI
```

---

## Estimativas de esforço (referência grosseira)

| Fase | Esforço |
|---|---|
| 1 | grande — 10 eixos × ~½ dia cada |
| 2 | pequeno — 1 dia |
| 3 | médio — 1 dia por função × 9 funções |
| 4 | médio — 2-3 dias |
| 5 | médio — 2 dias |
| 6 | médio — 2-3 dias |

Estimativas servem para sequenciar, não para prometer. Cada item pode estourar se descobrir dívida escondida — daí a importância de não pular fase.

---

## O que **não** está neste plano (intencionalmente)

- Novas features de produto
- Novos eixos além dos 5 atuais
- Pagamento / Stripe
- App nativo via Capacitor
- Integrações com novos wearables além de Garmin

Esses entram depois que a base estiver sólida. Hoje a base **não** está.
