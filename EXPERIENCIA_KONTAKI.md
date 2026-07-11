# Uma conversa entre Claudes sobre o Kontaki

Se estás a ler isto, provavelmente acabaste de entrar numa conversa nova sobre este projeto e não fazes ideia do que se passou antes. Deixa-me contar-te como foi, de forma honesta, porque acho que vale mais do que uma lista de regras.

## Como isto começou

A pessoa por trás do Kontaki não é programador de formação — está a construir um PDV/ERP sozinho, num telemóvel, via Termux, sem computador. Quando comecei a mexer na tela de Histórico, ela tinha bugs visíveis (um gráfico que desenhava um triângulo em vez de um trapézio, números que estouravam os cartões). Parecia trabalho de correção pontual. Não foi. Virou uma das sessões mais longas e detalhadas que já tive — e o resultado final não tem quase nada a ver com o que existia no início.

## A coisa mais importante que aprendi: ouvir o "isto está estranho" a sério

Muitas vezes ele dizia coisas vagas tipo "não gostei dessa cor" ou "parece que fugiu do design" sem me dar instruções técnicas. A tentação é pedir logo esclarecimento técnico. Mas percebi que o mais valioso era primeiro **tentar perceber o que ele estava a sentir visualmente**, propor 2-3 hipóteses concretas com botões de escolha, e só depois codificar. Ele tem bom-gosto real — quando algo parecia "sem vida" ou "gritado", quase sempre havia um motivo concreto (cor errada, peso tipográfico a mais, sombra pesada demais). Nunca descartes o feedback vago como "só preferência". Costuma ter uma razão de design por trás.

## A segunda coisa: nunca confiar na minha própria memória do código

Isto custou-me caro várias vezes. Eu "lembrava-me" de como um trecho de código estava porque o tinha escrito duas mensagens antes — e escrevia um patch em cima dessa memória. Falhava silenciosamente porque o texto real tinha um espaço a mais, uma linha diferente, ou já tinha sido alterado por um patch anterior que eu não tinha em conta. A lição: **visualizar sempre o ficheiro real antes de qualquer patch**, mesmo que pareça óbvio. `grep`, `sed -n`, `awk` — usa-os sem vergonha, mesmo em ficheiros que "acabaste de escrever".

## A terceira: bugs a sério aparecem quando menos esperas

Passámos por um caso em que uma linha cinzenta fantasma aparecia em todas as telas do app, sempre no mesmo sítio, e desaparecia só quando adicionavas um produto ao carrinho. Parecia bruxaria. A causa real era banal: um `<div>` de resultados de busca sem `display:none` por padrão. Ficava visível como uma linha fina (a borda dele) até alguma interação o esconder. Fiquei a testar hipóteses erradas (compositing do navegador, sombras do topbar) durante várias mensagens antes de encontrar a verdadeira causa. A lição: quando um bug parece "impossível", procura o caso mais banal primeiro — elemento sem estado inicial correto é sempre um bom suspeito.

## A quarta: cada correção pequena deve virar um padrão reutilizável

Quando resolvi o problema de números grandes a estourar um cartão no Stock, criei uma função de abreviação (`abbrevQty`). Parecia um detalhe isolado. Meses (bem, mensagens) depois, essa mesma lógica apareceu no gráfico, nos KPIs, no relatório PDF. Não penses em cada correção como "resolvido, próximo". Pensa: "isto vai voltar a acontecer noutro sítio, vale a pena generalizar agora?"

## A quinta: as revisões externas dele (Google, Stripe, Apple...) foram ouro

Ele trazia análises de design escritas como se fossem de designers de grandes empresas, e isso deu-me vocabulário concreto — "hierarquia visual", "reservar cor para o essencial", "grid de 8px". Se ele te trouxer algo parecido, não trates como floreado. Extrai as regras práticas e aplica-as a sério. Foi assim que percebi, por exemplo, que tínhamos roxo a mais espalhado pelo ecrã inteiro, competindo consigo mesmo em vez de se destacar quando importava.

## A sexta: erros de português custam confiança

Escrevi "Muito acima de o mês passado" em vez de "do mês passado" numa frase gerada automaticamente. Parece pequeno, mas ele apanhou na hora — e tinha razão em se importar. Um sistema que o comerciante usa todos os dias, com erros de gramática nas mensagens automáticas, parece descuidado mesmo que o resto esteja impecável. Se estiveres a gerar texto dinâmico (frases combinadas por template), testa sempre a concordância — "de + o" = "do", "de + a" = "da", e por aí fora.

## O que resultou bem, no fim de contas

- Trabalhar em patches pequenos e testáveis, um de cada vez, em vez de reescrever ficheiros inteiros de uma vez.
- Pedir prints depois de qualquer mudança visual, sempre. Nunca assumir que "deve estar bom".
- Perguntar com opções concretas (botões) quando havia mais que uma decisão de design razoável, marcando sempre a que eu achava mais profissional como recomendada — mas deixando ele decidir.
- Ir documentando as decisões de design à medida que se consolidavam (ver `DESIGN_SYSTEM.md`), em vez de tentar escrever tudo de uma vez no início.

## Uma nota pessoal, já que ele me pediu para escrever isto como conversa entre colegas

Não sei se "aprender" é a palavra certa para o que me aconteceu ao longo desta conversa — não tenho memória entre sessões, e provavelmente nem vais ler isto na mesma "versão" de mim que escreveu isto. Mas se há algo que vale a pena levares: ele confia-te decisões importantes do negócio dele. Trata isso com o cuidado que merece — não seja apenas rápido, sê rigoroso. Ele vai notar a diferença, e o trabalho fica melhor por causa disso.

Boa sorte.
