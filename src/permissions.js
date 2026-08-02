// Permissões granulares para operadores de caixa. O admin tem sempre
// todas (ver hasPermission). Ações estruturais (fecho de exercício,
// gestão de utilizadores, configurações críticas, workspace, fluxo de
// turno entre dispositivos) NÃO entram aqui — ficam presas a
// role === "admin" diretamente no ponto de uso, de propósito.

export const PERMISSIONS = [
  { key: "resolver_incidentes",         label: "Resolver incidentes",          desc: "Marcar divergências de stock como resolvidas" },
  { key: "ver_contabilidade",           label: "Ver contabilidade",            desc: "Aceder à Contabilidade, relatórios PDF e Business Intelligence" },
  { key: "editar_compras",              label: "Editar compras",               desc: "Alterar quantidades e custos de compras já registadas" },
  { key: "ajustar_stock",               label: "Ajustar stock",                desc: "Ações extra de ajuste na ficha do produto" },
  { key: "ver_custos_margem",           label: "Ver custos e margem",          desc: "Ver preço de custo, margem de lucro e KPI de lucro" },
  { key: "tesouraria_avancada",         label: "Tesouraria avançada",          desc: "Aporte de capital, retiradas e movimentos bancários" },
  { key: "ajustar_caixa_sem_aprovacao", label: "Ajustar caixa sem aprovação",  desc: "Regularizar diferenças de caixa sem pedir autorização" },
  { key: "exportar_dados",              label: "Exportar dados",               desc: "Exportar CSV e catálogo (não inclui backup completo)" },
  { key: "ver_auditoria",               label: "Ver auditoria",                desc: "Aceder ao registo de auditoria no Histórico" },
  { key: "aplicar_desconto",            label: "Aplicar desconto",             desc: "Aplicar desconto numa venda no checkout" },
  { key: "processar_devolucao",         label: "Processar devolução",          desc: "Registar devolução de uma venda" },
  { key: "editar_produtos",             label: "Editar produtos",              desc: "Criar produto novo e editar nome, preço ou categoria de produto existente" },
];

export function defaultPermissions() {
  var obj = {};
  PERMISSIONS.forEach(function(p) { obj[p.key] = false; });
  return obj;
}

// Admin tem sempre tudo. Caixa só tem o que estiver explicitamente true
// em user.permissions — ausência de campo (utilizador legado) equivale
// a tudo desligado, igual ao comportamento anterior à existência desta
// funcionalidade.
export function hasPermission(user, key) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return !!(user.permissions && user.permissions[key]);
}
