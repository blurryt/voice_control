import { useCallback, useEffect, useState } from 'react';
import type { StockItem, CommandLog } from '../types';

const STORAGE_KEY = 'voice_stock_items';
const LOG_KEY = 'voice_stock_logs';

const itensIniciais: StockItem[] = [
  { id: '1', nome: 'parafuso', quantidade: 150, unidade: 'un', categoria: 'Ferragem', ultimaAtualizacao: new Date() },
  { id: '2', nome: 'porca', quantidade: 200, unidade: 'un', categoria: 'Ferragem', ultimaAtualizacao: new Date() },
  { id: '3', nome: 'arruela', quantidade: 350, unidade: 'un', categoria: 'Ferragem', ultimaAtualizacao: new Date() },
  { id: '4', nome: 'caixa', quantidade: 25, unidade: 'un', categoria: 'Embalagem', ultimaAtualizacao: new Date() },
  { id: '5', nome: 'palete', quantidade: 12, unidade: 'un', categoria: 'Embalagem', ultimaAtualizacao: new Date() }
];

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function carregarItens(): StockItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return itensIniciais;
    const items: StockItem[] = JSON.parse(stored);
    return items.map(i => ({ ...i, ultimaAtualizacao: new Date(i.ultimaAtualizacao) }));
  } catch {
    return itensIniciais;
  }
}

function carregarLogs(): CommandLog[] {
  try {
    const stored = localStorage.getItem(LOG_KEY);
    if (!stored) return [];
    const logs: CommandLog[] = JSON.parse(stored);
    return logs.map(l => ({ ...l, timestamp: new Date(l.timestamp) }));
  } catch {
    return [];
  }
}

export interface UseStockResult {
  items: StockItem[];
  selectedItem: StockItem | null;
  logs: CommandLog[];

  selectItem: (id: string) => void;
  findByName: (nome: string) => StockItem | undefined;

  /** Retorna o item atualizado ou null se não encontrado */
  add: (id: string, quantidade: number) => StockItem | null;
  /** Retorna o item e se a operação foi bem-sucedida (não permite negativo) */
  subtract: (id: string, quantidade: number) => { item: StockItem | null; sufficient: boolean };
  /** Define quantidade absoluta */
  setQuantity: (id: string, quantidade: number) => StockItem | null;

  addLog: (log: Omit<CommandLog, 'id'>) => void;
  clearLogs: () => void;
  resetStock: () => void;
}

export function useStock(): UseStockResult {
  const [items, setItems] = useState<StockItem[]>(() => carregarItens());
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [logs, setLogs] = useState<CommandLog[]>(() => carregarLogs());

  // Persiste itens automaticamente
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  // Persiste logs (limita a 50)
  useEffect(() => {
    localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(0, 50)));
  }, [logs]);

  const selectedItem = selectedItemId
    ? items.find(i => i.id === selectedItemId) ?? null
    : null;

  const selectItem = useCallback((id: string) => {
    setSelectedItemId(id);
  }, []);

  const findByName = useCallback((nome: string): StockItem | undefined => {
    if (!nome) return undefined;
    const nomeNorm = normalizar(nome);

    // Match exato
    const exato = items.find(i => normalizar(i.nome) === nomeNorm);
    if (exato) return exato;

    // Match parcial
    return items.find(i => {
      const itemNorm = normalizar(i.nome);
      return itemNorm.includes(nomeNorm) || nomeNorm.includes(itemNorm);
    });
  }, [items]);

  const add = useCallback((id: string, quantidade: number): StockItem | null => {
    let atualizado: StockItem | null = null;
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      atualizado = {
        ...item,
        quantidade: item.quantidade + quantidade,
        ultimaAtualizacao: new Date()
      };
      return atualizado;
    }));
    return atualizado;
  }, []);

  const subtract = useCallback((id: string, quantidade: number) => {
    const atual = items.find(i => i.id === id);
    if (!atual) return { item: null, sufficient: false };
    if (quantidade > atual.quantidade) {
      return { item: atual, sufficient: false };
    }

    let atualizado: StockItem | null = null;
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      atualizado = {
        ...item,
        quantidade: item.quantidade - quantidade,
        ultimaAtualizacao: new Date()
      };
      return atualizado;
    }));
    return { item: atualizado, sufficient: true };
  }, [items]);

  const setQuantity = useCallback((id: string, quantidade: number): StockItem | null => {
    if (quantidade < 0) return null;
    let atualizado: StockItem | null = null;
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      atualizado = {
        ...item,
        quantidade,
        ultimaAtualizacao: new Date()
      };
      return atualizado;
    }));
    return atualizado;
  }, []);

  const addLog = useCallback((log: Omit<CommandLog, 'id'>) => {
    const novoLog: CommandLog = {
      ...log,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    };
    setLogs(prev => [novoLog, ...prev].slice(0, 50));
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const resetStock = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setItems(itensIniciais.map(i => ({ ...i, ultimaAtualizacao: new Date() })));
    setSelectedItemId(null);
  }, []);

  return {
    items,
    selectedItem,
    logs,
    selectItem,
    findByName,
    add,
    subtract,
    setQuantity,
    addLog,
    clearLogs,
    resetStock
  };
}
