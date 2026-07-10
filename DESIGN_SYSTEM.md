# Kontaki — Design System

Documento de referência para manter consistência visual em todo o app. Qualquer tela nova ou alteração deve seguir estas regras antes de inventar um padrão novo.

## 1. Cores (base.css)

### Marca e semânticas
| Token | Valor | Uso |
|---|---|---|
| `--primary` | #5b21b6 | Marca, ações primárias, aba ativa, hero |
| `--primary-mid` | #7c3aed | Gradiente do hero, ajustes administrativos (stock) |
| `--primary-light` | #ede9fe | Fundos claros de marca |
| `--success` | #16a34a | Positivo, compra, zero devoluções |
| `--success-light` | #dcfce7 | Fundo de sucesso |
| `--warning-muted` | #a87438 | Atenção suave (Fiado Aberto) — NUNCA laranja/amarelo saturado |
| `--warning-muted-light` | #f5ece1 | Fundo de atenção suave |
| `--danger-muted` | #b3554f | Atenção suave (Devoluções, anomalias) — NUNCA vermelho puro |
| `--danger-muted-light` | #f7e9e8 | Fundo de atenção suave |
| `--danger` | #dc2626 | Só para venda/saída no Stock, nunca em texto de KPI |
| `--info` | #2563eb | Transferência bancária |
| `--teal` | #0d9488 | Pagamento em dinheiro (ícone wallet) |
| `--teal-light` | #ccfbf1 | Fundo do ícone de dinheiro |
| `#4338ca` / `#e0e7ff` | — | Multicaixa (índigo, hardcoded no avatar) |

### Regra de ouro: reservar o roxo
KPIs neutros (contagens, médias) usam `var(--text)` — cinza escuro — não roxo. Roxo só aparece em: hero, aba ativa, botão primário, ícone de marca, ajustes de stock. Excesso de roxo "achata" a hierarquia (feedback de revisão de design).

### Texto
`--text` (#111827) até `--text4` (#9ca3af), escala decrescente de ênfase.

## 2. Tipografia

- Escala: `--text-2xs` (9px) → `--text-xs` (11px) → `--text-sm` (13px) → `--text-base` (14px) → `--text-lg` (16px) → `--text-xl` (22px)
- Pesos: `--weight-regular` (400), `--weight-medium` (600), `--weight-strong` (700)
- **Labels NÃO usam MAIÚSCULAS + letter-spacing pesado** (parece "gritado"). Preferir peso 600, tamanho normal, cor `--text3`.
- Números importantes (KPIs, hero, moeda) usam `font-variant-numeric: tabular-nums` para não "pular" ao animar/atualizar.
- Valores que podem crescer muito (moeda, contadores) precisam de classe de fonte responsiva (`--sm`/`--xs`) baseada no comprimento do texto, para nunca quebrar linha.

## 3. Espaçamento

Grid de 8px: `--space-1` (4px) a `--space-6` (32px). Preferir 8/12/16/24 em paddings e gaps. Evitar valores ímpares tipo 10px, 14px sem motivo.

## 4. Sombras e bordas

- `--shadow-sm` / `--shadow` / `--shadow-lg`: valores suaves (opacidade 0.05–0.10). Nunca sombra pesada — apps profissionais (Stripe/Linear) usam sombra quase imperceptível.
- `--radius-sm` (8px) a `--radius-xl` (20px).
- Cards de KPI/lista usam `border: 1px solid var(--border)` por padrão. Bordas coloridas (`border-left: 3px solid <cor>`) só em estados de **atenção real** (não decorativo).

## 5. Componentes padrão

### Card de KPI (`.hist-kpi`)
Estrutura: label (peso 600, não uppercase) → valor (tabular-nums, cor condicional) → sub opcional. Estado de atenção via `border-left` colorido + classe `--attention`/`--danger`. Grid 2 colunas, gap 12px, sempre em múltiplos de 4 (evitar sobra de espaço — completar com KPI extra se ficar ímpar).

### Ícone + cor por categoria (avatar pattern)
Todo tipo de evento (forma de pagamento, tipo de movimento de stock) tem: ícone Lucide próprio + cor de texto + cor de fundo clara. Nunca emoji no código — sempre `data-lucide`. Mapear em função JS tipo `payIcon()`/`payColor()`, nunca hardcoded inline repetido.

### Card de lista (vendas, movimentos, timeline)
Hierarquia: nome/produto em destaque (maior) → tag de tipo (pill colorido pequeno) → meta discreta (data, autor) em linha própria → valor à direita (grande, com abreviação para números grandes via `abbrevQty()`). Nunca duplicar o mesmo número em dois lugares do card.

### Agrupamento por dia
Usar `groupByDay(items, dateField)` + `dayLabel(dateStr)` (retorna "Hoje"/"Ontem"/"Dia da semana, DD de mês"). Separador visual com linhas finas dos dois lados do texto (estilo timeline), não caixa cheia.

### Números grandes
Sempre passar por função de abreviação (`abbrevQty`/`fmtChartVal`) em contextos de espaço apertado (badges, eixo de gráfico, valores flutuantes). Nunca deixar um número estourar um container de tamanho fixo.

### Modal de seleção (período, exportação)
Reaproveitar `openModal()`/`closeModal()` genérico. Opções como cards clicáveis com ícone colorido + título + descrição curta, animação de entrada em cascata (`animation-delay` incremental), nunca lista de texto simples sem estrutura.

### Skeleton loading
Todo carregamento assíncrono mostra skeleton (shimmer cinza) por um tempo mínimo (~280ms) antes do conteúdo real, mesmo que os dados cheguem mais rápido — evita "flash".

### Animações
- Transições de dados (gráfico, contadores): 500–1300ms, easing suave (`easeOutQuart` ou cubic-bezier customizado).
- Toques em botões/cards: `scale(.97)` no `:active`, nunca sem feedback.
- Trocar dataset de gráfico: usar `chart.update()`, nunca destruir/recriar o Canvas.

## 6. Regras de gramática (PT-PT/PT-AO)

Mensagens automáticas geradas por template **devem** respeitar contrações e gênero:
- "de + o" = "do" (do mês passado), "de + a" = "da" (da semana passada)
- "ontem" não leva artigo: "de ontem" está correto
- Sempre montar frases completas por contexto (não concatenar prefixo genérico + sufixo cru)
- Nomenclatura adaptada ao mercado angolano: preferir termos descritivos ("Média por Venda") a jargão importado sem tradução ("Ticket Médio")

## 7. Ícones — nunca emoji

Todo ícone visual usa Lucide (`data-lucide="..."`), nunca emoji Unicode diretamente no HTML/JS. Após inserir HTML com `data-lucide` dinamicamente, sempre chamar `refreshIcons(container)`.

## 8. Cache / Service Worker

Toda alteração de CSS/JS **exige** incrementar `CACHE_NAME` em `sw.js` (ex: `kontaki-v133` → `v134`), senão dispositivos com o app já aberto continuam servindo a versão antiga em cache.

## 9. Fluxo de trabalho de patches

- Mudanças em arquivo existente: sempre via `cat > patch_nome.py << 'PYEOF'` com `old`/`new` exatos, nunca editar manualmente.
- Sempre re-visualizar (`grep`/`sed -n`) o texto atual antes de montar um patch, para evitar mismatch por diferenças de espaçamento.
- Um patch por mudança lógica — não empacotar várias mudanças não relacionadas no mesmo patch.
- Commitar em blocos coerentes, com mensagem descritiva do "porquê", não só do "o quê".
