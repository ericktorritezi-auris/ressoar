// Importacao de planilhas (secao 5.1 do mapeamento): gera o modelo a
// partir do catalogo de indicadores do municipio, interpreta o CSV
// reenviado e valida antes de virar uma submissao pendente de aprovacao.

const indicadoresRepo = require('../indicadores/repositorio');

const CABECALHO = 'indicador,valor,periodo_referencia';

// Mesma deteccao de delimitador do modulo de dados publicos (secao 4) —
// Excel/Google Sheets em pt-BR exportam CSV separado por ponto-e-virgula,
// nao virgula (a virgula ja e o separador decimal em numeros como "7,8").
function detectarDelimitador(primeiraLinha) {
  const virgulas = (primeiraLinha.match(/,/g) || []).length;
  const pontoVirgulas = (primeiraLinha.match(/;/g) || []).length;
  return pontoVirgulas > virgulas ? ';' : ',';
}

// Guarda-corpo do formato generico chave/valor: a planilha de indicadores
// nunca deve carregar dado individual (CPF, nome de paciente/servidor,
// matricula, endereco) — sao sempre numeros agregados por municipio,
// igual a regra da secao 4 para os dados publicos. Verifica o CABECALHO
// enviado pelo usuario, nao o nosso modelo (o usuario pode ter
// acrescentado colunas).
const PADROES_COLUNA_PROIBIDA = [/cpf/i, /\bnome\b/i, /rg\b/i, /matr[ií]cula/i, /e-?mail/i, /telefone/i, /endere[cç]o/i, /nascimento/i];

function validarCabecalho(colunas) {
  const proibida = colunas.find((c) => PADROES_COLUNA_PROIBIDA.some((padrao) => padrao.test(c)));
  if (proibida) {
    throw new Error(
      `A coluna "${proibida}" parece conter dado identificável (CPF, nome, etc.) — planilhas de indicador só podem trazer números agregados, nunca dado individual.`
    );
  }
}

/**
 * Gera o CSV-modelo com uma linha por indicador ativo do municipio, para
 * o Responsavel pelos dados so preencher "valor" e "periodo_referencia".
 */
async function gerarModeloCsv(tenant, municipioId) {
  const indicadores = await indicadoresRepo.listarPorMunicipio(tenant, municipioId);
  const linhas = [CABECALHO];
  indicadores
    .filter((i) => i.ativo)
    .forEach((i) => {
      // Escapa virgula/aspas no nome do indicador, se houver.
      const nome = /[",]/.test(i.nome) ? `"${i.nome.replace(/"/g, '""')}"` : i.nome;
      linhas.push(`${nome},,`);
    });
  return linhas.join('\n') + '\n';
}

function dividirLinhaCsv(linha, delimitador) {
  // Suporta o caso simples de nome entre aspas (gerado por gerarModeloCsv);
  // nao e um parser CSV completo, mas cobre o uso deste formulario.
  if (linha.startsWith('"')) {
    const fim = linha.indexOf('",', 1);
    if (fim !== -1) {
      const primeira = linha.slice(1, fim).replace(/""/g, '"');
      const resto = linha.slice(fim + 2).split(delimitador);
      return [primeira, ...resto];
    }
  }
  return linha.split(delimitador);
}

/**
 * Interpreta o CSV reenviado e casa cada linha com o indicador do
 * catalogo pelo nome (case-insensitive). Linhas sem correspondencia
 * ficam com indicadorId nulo — ainda aparecem na pre-visualizacao, com
 * aviso, mas nao travam a importacao (o master decide na aprovacao).
 */
async function interpretarESeCasar(tenant, municipioId, conteudoCsv) {
  const linhas = conteudoCsv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (linhas.length === 0) throw new Error('Arquivo vazio.');

  const delimitador = detectarDelimitador(linhas[0]);
  const cabecalho = dividirLinhaCsv(linhas[0], delimitador).map((c) => c.trim().toLowerCase());
  validarCabecalho(cabecalho);

  const temCabecalho = cabecalho[0] === 'indicador';
  const linhasDeDados = temCabecalho ? linhas.slice(1) : linhas;
  if (linhasDeDados.length === 0) throw new Error('Nenhuma linha de dado encontrada no arquivo.');

  const indicadores = await indicadoresRepo.listarPorMunicipio(tenant, municipioId);
  const porNome = new Map(indicadores.map((i) => [i.nome.trim().toLowerCase(), i]));

  return linhasDeDados
    .map((linha) => {
      const [indicadorTexto, valor, periodo] = dividirLinhaCsv(linha, delimitador).map((c) => (c || '').trim());
      if (!indicadorTexto) return null;
      const encontrado = porNome.get(indicadorTexto.toLowerCase());
      const valorNumerico = Number(String(valor).replace(',', '.'));
      const ehNumero = valor !== '' && !Number.isNaN(valorNumerico);
      return {
        indicadorTexto,
        indicadorId: encontrado ? encontrado.id : null,
        eixoCodigo: encontrado ? encontrado.eixo_codigo : null,
        valorNumerico: ehNumero ? valorNumerico : null,
        valorTexto: ehNumero ? null : valor || null,
        periodoReferencia: periodo || null,
      };
    })
    .filter(Boolean);
}

module.exports = { gerarModeloCsv, interpretarESeCasar, validarCabecalho, detectarDelimitador };
