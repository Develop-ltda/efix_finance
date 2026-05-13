/**
 * clientes_lookup.js — Seed estático de clientes identificados via cruzamento manual.
 *
 * Cada chave é o NOME EXATO como aparece no BTG (campo "Pix recebido de [NOME]")
 * ou na Bridge/Sumsub. As fontes API (Bridge customers, Sumsub applicants) são
 * carregadas em runtime e fazem override deste seed via fuzzy match por nome.
 *
 * Pra adicionar um cliente manualmente:
 *   1. Adicionar entry com nome BTG → razão social + CNPJ + TipoNI
 *   2. Commit + push (deploy automático GitHub Pages)
 */

(function (global) {
  global.CLIENTES_LOOKUP = {
    '3RZ Servicos Digitais LTDA': {
      razaoSocial: '3RZ SERVICOS DIGITAIS LTDA',
      cnpj: '32611536000130',
      tipoNI: '2',
      pais: 'BR',
      cnae: '6619-3/99',
      sede: 'Rio de Janeiro/RJ',
      nota: 'PSP do Banco Genial; intermediadora da Bybit no Brasil',
      identificadoEm: '2026-05-12',
      source: 'manual',
    },
    'PL CONSULTORIA IMOBILIARIA LTDA': {
      razaoSocial: 'PL CONSULTORIA IMOBILIARIA LTDA',
      cnpj: '30678850000104',
      tipoNI: '2',
      pais: 'BR',
      cnae: '6821-8/01',
      sede: 'Recreio dos Bandeirantes, Rio de Janeiro/RJ',
      socioAdm: 'Jean Pierre Limongi de Freitas',
      nota: 'Corretagem imobiliária; única operação em Abr/2026 de R$ 389.512',
      identificadoEm: '2026-05-12',
      source: 'manual',
    },
    'JBECKER PROMOCAO DE VENDAS LTDA': {
      razaoSocial: 'J BECKER PROMOCAO DE VENDAS LTDA',
      cnpj: '46860369000175',
      tipoNI: '2',
      pais: 'BR',
      cnae: '7319-0/02',
      sede: 'Curitiba/PR',
      nota: 'Sem match Fireblocks na janela analisada — investigar entrega',
      identificadoEm: '2026-05-12',
      source: 'manual',
    },
    'FABRICIO SILVA SANTOS': {
      razaoSocial: 'FABRICIO SILVA SANTOS',
      cnpj: '',
      tipoNI: '1',
      pais: 'BR',
      nota: 'Pessoa física — CPF a preencher manualmente da base HausBank',
      identificadoEm: '2026-05-12',
      source: 'manual',
    },
    'HERVE YVES DANIEL LAURIOUX': {
      razaoSocial: 'HERVE YVES DANIEL LAURIOUX',
      cnpj: '',
      tipoNI: '1',
      pais: 'BR',
      nota: 'Pessoa física — 2 entradas R$ 50k em Mar/2026 sem match FB; investigar',
      identificadoEm: '2026-05-12',
      source: 'manual',
    },
    'BENEFICIO NACIONAL TRIBUTARIO LTDA': {
      razaoSocial: 'BENEFICIO NACIONAL TRIBUTARIO LTDA',
      cnpj: '',
      tipoNI: '2',
      pais: 'BR',
      nota: 'CNPJ a buscar via Receita Federal',
      identificadoEm: '2026-05-12',
      source: 'manual',
    },

    // === Intermediários conhecidos (para referência — não são clientes finais) ===
    '_TRANSFERO_INFO': {
      razaoSocial: 'TRANSFERO BRASIL PAGAMENTOS S.A.',
      cnpj: '31502183000171',
      tipoNI: '2',
      pais: 'BR',
      nota: 'PSP autorizado BCB — usado como ponte BRL↔crypto, NÃO cliente final',
      identificadoEm: '2026-05-12',
      _meta: 'intermediario',
    },
  };
})(window);
