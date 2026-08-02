/**
 * permissoes.js
 * ------------------------------------------------------------
 * Mapa central de quais perfis podem acessar cada pagina.
 * Editar AQUI quando criar pagina nova ou alterar permissao.
 *
 * Perfis:
 *   admin      - acesso total + gerencia usuarios
 *   logistica  - roteiriza, despacha, ve torre, programacao
 *   comercial  - ve estoque, pedidos, simuladores
 *   operacao   - opera separacao e carregamento
 *
 * Motorista nao tem login (acesso via token unico na URL).
 * ------------------------------------------------------------
 */

export const PERFIS = ['admin', 'logistica', 'comercial', 'operacao'];

// Senha padrao usada ao criar novos usuarios (sempre exige troca no 1o login)
export const SENHA_PADRAO = '123456';

// Regex de validacao da nova senha: min 8 chars, >=1 letra, >=1 numero, >=1 caractere especial
export const SENHA_NOVA_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
export const SENHA_NOVA_DESCRICAO = 'Mínimo 8 caracteres, com letras, números e ao menos um símbolo (ex: @, !, #, $).';

// Mapa pagina -> perfis permitidos
export const PERMISSOES = {
  // Gestao
  'usuarios.html':            ['admin'],

  // Operacao logistica
  'roteirizador.html':        ['admin', 'logistica'],
  'separacao.html':           ['admin', 'logistica', 'operacao'],
  'carregamento.html':        ['admin', 'logistica', 'operacao'],
  'torre.html':               ['admin', 'logistica', 'comercial'],
  'farol.html':               ['admin', 'logistica', 'comercial'],

  // Estoque / comercial
  'estoque.html':             ['admin', 'logistica', 'comercial'],
  'estoque-omie.html':        ['admin', 'logistica', 'comercial'],
  'comercial.html':           ['admin', 'logistica', 'comercial'],
  'anexos.html':               ['admin', 'logistica', 'comercial'],
  'anexo-ar.html':             ['admin', 'logistica'],

  // Producao
  'programacao.html':         ['admin', 'logistica'],
  'calendario.html':          ['admin', 'logistica'],
  'apontamento.html':         ['admin', 'logistica'],
  'fechamento-op.html':       ['admin', 'logistica'],
  'carregamento.html': ['admin', 'logistica', 'operacao'],
  'despacho.html':     ['admin', 'logistica'],
  
  // Carteira
  'carteira.html':            ['admin', 'logistica', 'comercial'],
  
  // Simuladores
  'simulador.html':           ['admin', 'logistica', 'comercial'],
  'simulador-producao.html':  ['admin', 'logistica', 'comercial'],

  // Home - todos os perfis logados
  'index.html':               ['admin', 'logistica', 'comercial', 'operacao'],

  // Tela de troca de senha - obrigatoria no 1o login
  'trocar-senha.html':        ['admin', 'logistica', 'comercial', 'operacao'],

  // Ferramentas de diagnostico/debug (chamam a Omie direto) - so admin
  'diagnostico.html':         ['admin'],
  'teste-proxy.html':         ['admin'],
};

// Paginas publicas (sem login)
export const PAGINAS_PUBLICAS = new Set([
  'login.html',
  'motorista.html',
]);

/**
 * Retorna nome da pagina atual a partir do pathname.
 * Ex: "/roteirizador.html" -> "roteirizador.html"
 *     "/" ou "" -> "index.html"
 */
export function paginaAtual() {
  const path = window.location.pathname.toLowerCase();
  const file = path.split('/').pop() || 'index.html';
  return file === '' ? 'index.html' : file;
}

/**
 * True se a pagina dispensa autenticacao.
 */
export function ehPublica(pagina = paginaAtual()) {
  return PAGINAS_PUBLICAS.has(pagina);
}

/**
 * True se o perfil tem acesso a pagina.
 * Se a pagina nao esta no mapa, libera para admin so (fail-safe).
 */
export function podeAcessar(perfil, pagina = paginaAtual()) {
  const permitidos = PERMISSOES[pagina];
  if (!permitidos) return perfil === 'admin';
  return permitidos.includes(perfil);
}
