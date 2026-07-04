export default [
  {
    id: "turno-abrir",
    category: "Turnos",
    categoryIcon: "clock",
    title: "Como abrir um turno",
    keywords: ["abrir turno", "começar turno", "iniciar turno", "novo turno", "abrir caixa"],
    body: "Vai a Perfil → Meu Turno → \"Abrir turno\". Antes de abrir, confirma o stock físico de cada produto e o dinheiro que está na gaveta (fundo de caixa). Se algum valor não bater com o que o sistema espera (herdado do turno anterior), aparece um aviso a perguntar se queres continuar mesmo assim ou cancelar. Se continuares, é criado um incidente para investigar depois — o turno abre na mesma, não fica bloqueado."
  },
  {
    id: "turno-fechar",
    category: "Turnos",
    categoryIcon: "clock",
    title: "Como fechar um turno",
    keywords: ["fechar turno", "encerrar turno", "exportar ktk", "fim do dia", "fechar caixa"],
    body: "Em Perfil → Meu Turno → \"Fechar turno e exportar .ktk\". Vais confirmar o dinheiro físico na gaveta e o stock de cada produto. Se houver diferença em relação ao esperado, é criado um incidente automaticamente (visível em Incidentes). No fim, um ficheiro .ktk é gerado — guarda-o ou partilha por WhatsApp com o responsável da loja."
  },
  {
    id: "turno-cadeia-responsabilidade",
    category: "Turnos",
    categoryIcon: "clock",
    title: "O que é a Cadeia de Responsabilidade",
    keywords: ["cadeia de responsabilidade", "auditoria", "quem abriu", "histórico de turnos", "prevSessionUuid"],
    body: "Cada turno fica ligado ao turno anterior (quem o abriu confirma o que o turno anterior deixou). Isto cria uma cadeia contínua: se houver uma diferença de dinheiro ou stock, dá para ver exactamente em que turno ela apareceu e quem era responsável nessa altura. Vê tudo em Histórico → Auditoria."
  },
  {
    id: "turno-um-por-vez",
    category: "Turnos",
    categoryIcon: "clock",
    title: "Porque só posso ter um turno aberto de cada vez",
    keywords: ["turno duplicado", "vários turnos", "login abre turno", "turno automático"],
    body: "O login apenas autentica — nunca abre um turno sozinho. Se já tiveres um turno aberto, ao fazeres login a app reconecta-te a ele automaticamente (não cria outro). Isto evita turnos fantasma e mantém a auditoria limpa: um turno só é criado quando clicas \"Abrir turno\" manualmente."
  },
];
