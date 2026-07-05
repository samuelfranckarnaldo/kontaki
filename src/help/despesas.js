export default [
  {
    id: "desp-contabilidade-toggle",
    category: "Despesas",
    categoryIcon: "receipt",
    title: "O que significa \"Conta para a contabilidade\"",
    keywords: ["conta para contabilidade", "despesa pessoal", "lucro", "toggle contabilidade"],
    body: "Ao registar uma despesa, um interruptor pergunta se ela deve entrar no cálculo de lucro do negócio. Vem sempre marcado como \"sim\" por padrão, porque a maioria das despesas de loja são operacionais. Desmarca só se for uma retirada pessoal ou uma despesa sem comprovativo — assim o relatório de lucro não fica distorcido."
  },
  {
    id: "desp-metodo-pagamento",
    category: "Despesas",
    categoryIcon: "receipt",
    title: "Método de pagamento nas despesas",
    keywords: ["método de pagamento despesa", "dinheiro despesa", "multicaixa", "transferência despesa"],
    body: "Cada despesa regista se foi paga em Dinheiro, Multicaixa ou Transferência. Isto é importante porque só as despesas pagas em dinheiro afectam a conferência de caixa no fecho de turno — uma despesa paga por transferência não sai da gaveta física."
  },
  {
    id: "desp-fornecedor",
    category: "Despesas",
    categoryIcon: "receipt",
    title: "Ligar uma despesa a um fornecedor",
    keywords: ["despesa fornecedor", "ligar fornecedor", "gasto por fornecedor"],
    body: "Ao registar uma despesa, podes escolher um fornecedor já cadastrado (opcional). Isto permite ver, na própria ficha do fornecedor, o total e o histórico de tudo o que já lhe pagaste — sem teres de vasculhar despesa por despesa."
  },
  {
    id: "desp-arquivar",
    category: "Despesas",
    categoryIcon: "receipt",
    title: "Arquivar em vez de eliminar despesas",
    keywords: ["eliminar despesa", "arquivar despesa", "apagar despesa"],
    body: "Despesas nunca são eliminadas de vez — são arquivadas. Saem da lista principal e dos totais do mês, mas continuam guardadas para auditoria no filtro \"Arquivadas\", e podem ser restauradas a qualquer momento."
  },
  {
    id: "desp-navegacao-mes",
    category: "Despesas",
    categoryIcon: "receipt",
    title: "Ver despesas de meses anteriores",
    keywords: ["mês anterior despesas", "navegar mês", "histórico mensal despesas"],
    body: "Usa as setas por cima do total para navegar entre meses. O card de total e a barra \"Por categoria\" mudam para reflectir o mês seleccionado. A seta para a frente fica desactivada quando já estás no mês actual. A secção \"Histórico\" mostra sempre tudo, independente do mês seleccionado."
  },
  {
    id: "desp-exportar-csv",
    category: "Despesas",
    categoryIcon: "receipt",
    title: "Exportar despesas para o contabilista (CSV)",
    keywords: ["exportar despesas", "csv despesas", "excel despesas", "enviar contabilista"],
    body: "O botão \"Exportar CSV\" gera um ficheiro com todas as colunas importantes (data, descrição, categoria, valor, método de pagamento, fornecedor, se conta para contabilidade). Podes escolher exportar só o mês que estás a ver ou o histórico completo. O ficheiro abre bem no Excel, incluindo acentos."
  },
  {
    id: "desp-recorrentes",
    category: "Despesas",
    categoryIcon: "receipt",
    title: "Despesas recorrentes (ex: renda mensal)",
    keywords: ["despesa recorrente", "renda mensal", "repetir despesa", "sugestão mensal"],
    body: "Ao marcar \"Repetir todo mês\" numa despesa, a app passa a sugerir — nunca cria sozinha — registá-la de novo no início de cada mês seguinte, caso ainda não tenha sido feita. Aparece um cartão roxo no topo da página com um botão \"Registar\" que pré-preenche tudo, só tens de confirmar a data."
  },
];
