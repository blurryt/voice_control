import type { VoiceCommand, CommandAction } from '../types';

// Mapeamento de palavras-número (português) para dígitos
const numerosTexto: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, três: 3,
  quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14,
  quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60,
  setenta: 70, oitenta: 80, noventa: 90, cem: 100, cento: 100,
  duzentos: 200, trezentos: 300, mil: 1000
};

// Sinônimos para cada ação
const acoesAdicionar = ['adicionar', 'adiciona', 'somar', 'soma', 'incluir',
  'inclui', 'aumentar', 'aumenta', 'incrementar', 'incrementa', 'mais',
  'colocar', 'coloca', 'entrar', 'entrada', 'repor'];

const acoesRemover = ['remover', 'remove', 'subtrair', 'subtrai', 'tirar',
  'tira', 'retirar', 'retira', 'diminuir', 'diminui', 'decrementar',
  'decrementa', 'menos', 'baixar', 'baixa', 'saida', 'saída'];

const acoesDefinir = ['definir', 'define', 'ajustar', 'ajusta', 'setar',
  'seta', 'configurar', 'configura', 'estabelecer'];

const acoesConsultar = ['consultar', 'consulta', 'verificar', 'verifica',
  'mostrar', 'mostra', 'exibir', 'quanto', 'quantos', 'quantas', 'qual', 'ver'];

const acoesSelecionar = ['selecionar', 'seleciona', 'escolher', 'escolhe',
  'item', 'produto', 'usar'];

const todasAcoes = [
  ...acoesAdicionar,
  ...acoesRemover,
  ...acoesDefinir,
  ...acoesConsultar,
  ...acoesSelecionar
];

const conectores = ['de', 'do', 'da', 'dos', 'das', 'no', 'na', 'em', 'para',
  'a', 'o', 'um', 'uma', 'uns', 'umas', 'e', 'que', 'tem', 'ha', 'há', 'tenho'];

/**
 * Remove acentos, pontuação e converte para minúsculas
 */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,!?;:"]/g, '')
    .trim();
}

/**
 * Identifica qual ação está sendo solicitada
 */
function detectarAcao(palavras: string[]): CommandAction {
  for (const palavra of palavras) {
    if (acoesAdicionar.includes(palavra)) return 'adicionar';
    if (acoesRemover.includes(palavra)) return 'remover';
    if (acoesDefinir.includes(palavra)) return 'definir';
    if (acoesConsultar.includes(palavra)) return 'consultar';
    if (acoesSelecionar.includes(palavra)) return 'selecionar';
  }
  return 'desconhecido';
}

/**
 * Extrai a quantidade numérica do comando.
 * Aceita números em dígitos (5) ou por extenso (cinco, vinte e cinco).
 */
function extrairQuantidade(palavras: string[]): number | undefined {
  // Tenta primeiro encontrar dígitos
  for (const palavra of palavras) {
    const numero = parseInt(palavra, 10);
    if (!isNaN(numero) && numero >= 0) {
      return numero;
    }
  }

  // Tenta números por extenso, somando para compostos ("vinte e cinco")
  let total = 0;
  let encontrouNumero = false;
  for (const palavra of palavras) {
    if (Object.prototype.hasOwnProperty.call(numerosTexto, palavra)) {
      total += numerosTexto[palavra];
      encontrouNumero = true;
    }
  }

  return encontrouNumero ? total : undefined;
}

/**
 * Tenta extrair o nome de um item do comando.
 * Filtra ações, conectores e números — o que sobra é o nome.
 */
function extrairNomeItem(palavras: string[]): string | undefined {
  const filtradas = palavras.filter(p => {
    if (todasAcoes.includes(p)) return false;
    if (conectores.includes(p)) return false;
    if (!isNaN(parseInt(p, 10))) return false;
    if (Object.prototype.hasOwnProperty.call(numerosTexto, p)) return false;
    return true;
  });

  if (filtradas.length === 0) return undefined;
  return filtradas.join(' ');
}

/**
 * Analisa o texto reconhecido e retorna o comando estruturado.
 * Exemplos:
 *  - "Adicionar 5"
 *  - "Adiciona cinco caixas"
 *  - "Remover 2 do parafuso"
 *  - "Definir 100"
 *  - "Quantos parafusos tem"
 */
export function parseCommand(texto: string): VoiceCommand {
  const original = texto;
  const textoNormalizado = normalizar(texto);
  const palavras = textoNormalizado.split(/\s+/).filter(p => p.length > 0);

  const acao = detectarAcao(palavras);
  const quantidade = extrairQuantidade(palavras);
  const itemNome = extrairNomeItem(palavras);

  return {
    acao,
    quantidade,
    itemNome,
    textoOriginal: original
  };
}
