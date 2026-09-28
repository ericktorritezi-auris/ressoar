// Catalogo de formularios prontos (secao 5.2 do mapeamento): NR-1,
// nine box, pesquisa de clima/satisfacao e dados institucionais. Cada
// campo tem {chave, rotulo, tipo, obrigatorio, opcoes?}. Tipos suportados
// pela view de resposta (formularios/responder.ejs): texto, texto_longo,
// numero, data, selecao, escala_1_5.

const MODELOS = {
  nr1_inventario_riscos: {
    nome: 'NR-1 · Inventário de riscos psicossociais por setor',
    descricao:
      'Levantamento de riscos psicossociais por setor da prefeitura, base para o plano de ação (GRO/PGR) do módulo NR-1 (seção 3.4).',
    campos: [
      { chave: 'setor', rotulo: 'Setor/secretaria avaliado', tipo: 'texto', obrigatorio: true },
      { chave: 'risco_identificado', rotulo: 'Risco psicossocial identificado', tipo: 'texto_longo', obrigatorio: true },
      {
        chave: 'nivel_risco',
        rotulo: 'Nível de risco',
        tipo: 'selecao',
        obrigatorio: true,
        opcoes: ['Baixo', 'Médio', 'Alto'],
      },
      { chave: 'acao_planejada', rotulo: 'Ação planejada (plano de ação)', tipo: 'texto_longo', obrigatorio: false },
      { chave: 'responsavel', rotulo: 'Responsável pela ação', tipo: 'texto', obrigatorio: false },
      { chave: 'prazo', rotulo: 'Prazo da ação', tipo: 'data', obrigatorio: false },
    ],
  },
  nine_box: {
    nome: 'Nine Box · Desempenho x Potencial',
    descricao: 'Avaliação de desempenho e potencial de um servidor, para o eixo B (Saúde do Servidor).',
    campos: [
      { chave: 'servidor_avaliado', rotulo: 'Servidor avaliado', tipo: 'texto', obrigatorio: true },
      {
        chave: 'desempenho',
        rotulo: 'Desempenho',
        tipo: 'selecao',
        obrigatorio: true,
        opcoes: ['Abaixo do esperado', 'Dentro do esperado', 'Acima do esperado'],
      },
      {
        chave: 'potencial',
        rotulo: 'Potencial',
        tipo: 'selecao',
        obrigatorio: true,
        opcoes: ['Baixo', 'Médio', 'Alto'],
      },
      { chave: 'observacoes', rotulo: 'Observações', tipo: 'texto_longo', obrigatorio: false },
    ],
  },
  pesquisa_clima: {
    nome: 'Pesquisa de clima/satisfação',
    descricao: 'Pesquisa anônima de clima organizacional por setor, para o eixo B (Saúde do Servidor).',
    campos: [
      { chave: 'setor', rotulo: 'Setor/secretaria', tipo: 'texto', obrigatorio: true },
      { chave: 'satisfacao_geral', rotulo: 'Satisfação geral (1 a 5)', tipo: 'escala_1_5', obrigatorio: true },
      { chave: 'relacionamento_equipe', rotulo: 'Relacionamento com a equipe (1 a 5)', tipo: 'escala_1_5', obrigatorio: true },
      { chave: 'carga_trabalho', rotulo: 'Percepção de carga de trabalho (1 a 5)', tipo: 'escala_1_5', obrigatorio: true },
      { chave: 'comentario', rotulo: 'Comentário (opcional)', tipo: 'texto_longo', obrigatorio: false },
    ],
  },
  dados_institucionais: {
    nome: 'Dados institucionais',
    descricao: 'Informações estruturais da prefeitura, usadas como contexto para os 5 eixos do programa.',
    campos: [
      { chave: 'total_servidores', rotulo: 'Total de servidores', tipo: 'numero', obrigatorio: true },
      { chave: 'servidores_clt', rotulo: 'Servidores CLT', tipo: 'numero', obrigatorio: false },
      { chave: 'servidores_estatutarios', rotulo: 'Servidores estatutários', tipo: 'numero', obrigatorio: false },
      { chave: 'possui_cipa', rotulo: 'Possui CIPA?', tipo: 'selecao', obrigatorio: true, opcoes: ['Sim', 'Não'] },
      { chave: 'possui_sesmt', rotulo: 'Possui SESMT?', tipo: 'selecao', obrigatorio: true, opcoes: ['Sim', 'Não'] },
      { chave: 'observacoes', rotulo: 'Observações', tipo: 'texto_longo', obrigatorio: false },
    ],
  },
};

function listar() {
  return Object.entries(MODELOS).map(([codigo, m]) => ({ codigo, nome: m.nome, descricao: m.descricao }));
}

function buscar(codigo) {
  return MODELOS[codigo] || null;
}

const TIPOS_CAMPO_PERSONALIZADO = [
  { valor: 'texto', rotulo: 'Texto curto' },
  { valor: 'texto_longo', rotulo: 'Texto longo' },
  { valor: 'numero', rotulo: 'Número' },
  { valor: 'data', rotulo: 'Data' },
  { valor: 'escala_1_5', rotulo: 'Escala de 1 a 5' },
];

module.exports = { MODELOS, listar, buscar, TIPOS_CAMPO_PERSONALIZADO };
