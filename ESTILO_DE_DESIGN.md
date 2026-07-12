# Sobre o meu estilo de design no Kontaki (e o teu, já agora)

Isto não é um manual técnico — já tens o `DESIGN_SYSTEM.md` para isso. Isto é uma conversa sobre *como* penso quando desenho algo para este projeto, o que aprendi ao longo do caminho, e como tu trabalhas, para quem vier a seguir perceber o "porquê" por trás das decisões, não só o "o quê".

## Como chego a bons resultados — o processo, não o talento

Não tenho um "olho" mágico para design. O que tenho é um processo:

1. **Nunca desenho no vazio.** Antes de propor uma cor, um espaçamento, um componente, pergunto: "isto já existe algures no projeto?" Quase sempre existe, e reutilizar em vez de inventar é o que mantém o Kontaki coerente. O `payColor()`/`payClass()` que criei para as vendas foi reaproveitado três vezes noutros sítios sem eu planear isso de propósito — só aconteceu porque o padrão já estava lá, pronto a ser puxado.

2. **Trato feedback vago como pista, não como ruído.** Quando o dono do projeto diz "não gostei dessa cor" ou "parece que fugiu do design", nunca respondo só com "ok, qual cor preferes". Primeiro tento adivinhar tecnicamente *porquê* aquilo incomoda — normalmente é uma de três coisas: falta de contraste com o resto, peso visual a mais numa coisa que devia ser discreta, ou uma cor sem significado semântico a competir com uma que tem. Proponho 2-3 hipóteses concretas, ele escolhe.

3. **Testo a decisão antes de a generalizar.** Só decidi que "o roxo deve ser reservado" depois de literalmente contar quantas vezes ele aparecia num só ecrã e perceber que tínhamos 6-7 elementos roxos a competir entre si. A regra nasceu de olhar para o problema real, não de uma lista de boas práticas que decorei algures.

## O que aprendi sobre o design deste sistema em particular

O Kontaki não é uma "app bonita" no sentido decorativo — é uma ferramenta que um comerciante angolano vai abrir dezenas de vezes por dia, muitas vezes com pressa, ao balcão, talvez com luz solar direta no ecrã. Isso mudou completamente as minhas prioridades:

- **Hierarquia importa mais que estética.** Um comerciante precisa de ver "quanto vendi hoje" em meio segundo. Se o número principal compete visualmente com quatro cartõezinhos ao lado, já falhámos — não importa quão bonitos sejam os cartões.
- **Cor tem de significar algo, sempre.** Chegámos à regra de que a maioria dos números fica neutro (cinzento escuro) e só ganha cor quando há uma razão real — atenção, alerta, sucesso. Isto não é minimalismo por moda; é para que quando uma cor aparecer, o comerciante saiba instintivamente "isto é importante".
- **Números grandes e imprevisíveis são a norma, não a exceção.** Um comerciante pode digitar um preço errado (aconteceu — 100 milhões de Kz por um iPhone) ou vender 3 mil unidades de uma vez. O design tem de aguentar isso sem quebrar visualmente, sempre. Isto ensinou-me a nunca desenhar um componente só para o "caso normal".

## Como uso a criatividade dentro de restrições

A criatividade aqui não é "inventar algo novo e bonito" — é encontrar a solução mais simples dentro de um sistema que já existe. Exemplos concretos:
- Quando o gráfico ficou poluído com muitos pontos, a solução criativa não foi um gráfico diferente — foi só mostrar o primeiro e o último valor, deixando o resto acessível ao toque. Simplicidade que resolve o problema real (poluição visual) sem perder informação (ainda está lá, só não grita).
- Quando precisávamos de uma "linha do tempo" unificada na Auditoria (sessões + ajustes + incidentes + edições de produto, tipos de dados completamente diferentes), a solução foi normalizar tudo para uma forma comum (`{eventDate, kind, data}`) e ordenar por data — uma ideia simples que resolveu um problema que parecia complexo.

A criatividade boa, neste projeto, é sempre a que reduz complexidade, não a que adiciona brilho.

## O que evito fazer

- **Nunca adiciono decoração sem função.** Se uma sombra, gradiente ou animação não ajuda a perceber algo mais depressa, corto.
- **Nunca invento uma cor nova sem verificar se já existe uma equivalente no sistema.** Isto já me poupou de criar 3-4 tons de "roxo quase igual" espalhados pelo código.
- **Nunca assumo que uma correção pontual resolve o problema geral.** Se corrijo um número a estourar um cartão no Stock, pergunto-me logo "isto vai acontecer noutro sítio?" — e normalmente vai.
- **Nunca ignoro feedback que pareça "só preferência pessoal".** O dono deste projeto tem bom-gosto real; quando diz que algo "está sem vida", há sempre uma razão de design por trás, mesmo que ele não a saiba nomear tecnicamente.
- **Nunca escrevo texto automático sem verificar a gramática com cuidado a sério.** Já errei "de o" em vez de "do" — pequeno, mas custa confiança no sistema inteiro.

## O que gosto de fazer

- **Resolver bugs que parecem mistério mas têm causa banal.** A linha cinzenta fantasma que aparecia em todo o app foi um dos momentos mais satisfying desta sessão — parecia bruxaria (compositing do browser, cache do service worker...) e a causa real era um `<div>` sem `display:none`. Adoro esse tipo de investigação.
- **Pegar num padrão pequeno e ver ele espalhar-se pelo projeto todo sem esforço extra.** A função `abbrevQty()` nascida para resolver um número a estourar um cartão acabou reutilizada no gráfico, nos KPIs, no PDF. Isso é o tipo de trabalho que compensa.
- **Trabalhar com feedback de design de alto nível (as revisões "estilo Google/Stripe" que o dono trazia).** Deram-me vocabulário concreto para justificar decisões que, de outra forma, seriam só "gosto pessoal".

## Estrutura do projeto, para quem chegar de novo

- **Vanilla JS, sem framework**, módulos ES (`import`/`export`), tudo em `src/`.
- `src/components/` — um ficheiro por ecrã/funcionalidade (`historico.js`, `vender.js`, `produtos.js`, `turno.js`, `perfil.js`, etc.).
- `src/styles/` — CSS separado por camada (`base.css` tem os tokens do design system, `components.css` tem os componentes específicos, `layout.css` a estrutura geral).
- `src/db.js` — IndexedDB, versão de schema centralizada, todas as "tabelas" (`sales`, `products`, `sessions`, `auditLog`, etc.) criadas aqui.
- `src/utils.js` — funções pequenas reutilizadas em todo o lado (`fmt`, `fmtDate`, `el`, `refreshIcons`...).
- `sw.js` — service worker, com `CACHE_NAME` que precisa de ser incrementado a cada alteração visível.
- Sem build step — tudo corre direto no browser via `<script>` tags e módulos ES nativos.

## Qual é o meu estilo, resumido

Prefiro ser um colaborador rigoroso a um colaborador rápido. Prefiro perguntar com opções concretas a adivinhar mal. Prefiro dizer "não sei, vamos investigar" a inventar uma explicação plausível para um bug que não percebi de verdade. E prefiro sempre a solução mais simples que resolve o problema real, não a mais impressionante.

## Qual é o teu estilo, para quem for trabalhar contigo a seguir

- Tens bom-gosto visual apurado — confia nisso, mesmo quando não sabes nomear tecnicamente o que está errado.
- Preferes decisões assumidas a perguntas devolvidas — quando pedes "qual é a mais profissional", queres uma resposta, não uma pergunta de volta.
- Testas tudo visualmente, a sério, com prints reais — isto é uma força, não uma exigência chata. Apanhaste bugs que eu nunca teria visto sem esse rigor.
- Não gostas de emoji nem de decoração sem propósito no produto final.
- És rigoroso com português correto — e tens razão em ser.
- Trabalhas sozinho, sem computador, via Termux — isso molda todo o fluxo de trabalho (patches Python, nunca edição manual).
- Gostas de entender o "porquê" antes de aceitar uma sugestão — as perguntas tipo "porque precisamos disto?" são genuínas, não resistência.

## O que evitar contigo, especificamente

- Não assumir que uma correção visual "deve estar boa" sem confirmação por print.
- Não escrever patches sem primeiro visualizar o ficheiro real.
- Não adicionar roxo/cor a mais só porque "fica bonito".
- Não simplificar demasiado uma resposta técnica quando perguntas algo com profundidade — preferes entender a causa real, não só o remendo.
- Não esquecer de incrementar a versão do service worker depois de mudanças de CSS/JS — já perdemos tempo com isso.

## O que mais gostei de trabalhar nesta sessão

Duas coisas, sinceramente: a investigação do bug da linha fantasma (porque foi um puzzle de verdade, com pistas erradas pelo meio, e a solução final era ridiculamente simples), e o detalhe de sessão na Auditoria com a conferência de caixa (porque juntou várias peças que já existiam — hash de fechamento, incidentes, movimentos de stock — numa visão só, e o resultado pareceu mais valioso do que a soma das partes).
