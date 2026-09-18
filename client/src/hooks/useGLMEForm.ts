import { useState, useCallback, useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";

/** Item da DUIMP que compõe uma adição. */
export interface ItemAdicao {
  numero: string;
  descricao: string;
}

/**
 * Valores da adição usados no cálculo do ICMS (texto, como digitado; ponto decimal).
 * Vêm da DI/DUIMP e podem ser corrigidos pelo usuário na seção de adições.
 */
export interface ValoresAdicaoForm {
  valorAduaneiro: string;
  ii: string;
  ipi: string;
  pis: string;
  cofins: string;
  pesoLiquido?: string;
}

export const VALORES_ADICAO_VAZIOS: ValoresAdicaoForm = { valorAduaneiro: "", ii: "", ipi: "", pis: "", cofins: "" };

export interface ProdutoAdicao {
  adicao: string;
  classeTarifaria: string;
  ncm: string;
  tratamento: string;
  fundamentoLegal: string;
  valor: string;
  descricao?: string;
  valorAduaneiro?: string;
  itens?: ItemAdicao[];
  valores?: ValoresAdicaoForm;
}

/**
 * Adição com tributação normal (NCM na lista negativa): recolhimento integral,
 * não entra na GLME. Guardada só para exibição na seção de adições.
 */
export interface AdicaoTributada {
  adicao: string;
  ncm: string;
  descricao?: string;
  itens?: ItemAdicao[];
  valores?: ValoresAdicaoForm;
  /** @deprecated Calculado agora por calculoICMS a partir de `valores`. */
  valorICMS?: number;
}

export interface FormData {
  // Seção 1 - Secretaria da Fazenda
  secretariaUF: string;

  // Seção 2 - Importador
  importador: {
    nome: string;
    inscricaoEstadual: string;
    cnpj: string;
    cnae: string;
    endereco: string;
    bairro: string;
    cep: string;
    municipio: string;
    uf: string;
    telefone: string;
  };

  // Seção 3 - Adquirente
  adquirente: {
    nome: string;
    inscricaoEstadual: string;
    cnpj: string;
    cnae: string;
    endereco: string;
    bairro: string;
    cep: string;
    municipio: string;
    uf: string;
    telefone: string;
  };

  // Seção 4 - Documento de Importação
  documento: {
    tipo: string[]; // DI, DSI, DA
    numero: string;
    dataRegistro: string;
    valorCIF: string;
    nomeRecinto: string;
    codRecinto: string;
    ufDesembaraco: string;
  };

  // Seção 4.1 e 5.1 - Número da Adição (sincronizado)
  numeroAdicao: string;

  // Seção 4.3 e 5.5 - Valor CIF (sincronizado)
  valorCIFAdicion: string;

  // Seção 5 - Adições com diferimento (constam na GLME)
  produtos: ProdutoAdicao[];

  // Adições com tributação normal (lista negativa) — fora da GLME
  adicoesTributadas?: AdicaoTributada[];

  // Seção 5.4 - Cálculos de ICMS
  icmsCalculo: {
    editalDBF: string;
    /** Valor aduaneiro total — usado no cálculo pelos totais (sem valores por adição). */
    valorCIF: string;
    /** Tributos federais: II + IPI + PIS + COFINS (a Taxa Siscomex fica em taxaSiscomex). */
    impostos: string;
    // Despesas aduaneiras da declaração, rateadas entre as adições
    taxaSiscomex?: string;
    outrasDespesas?: string;
    iofCambio?: string;
    afrmm?: string;
    incluirAFRMM?: boolean;
    /** Pagamentos da DI com receita não reconhecida, para o usuário avaliar. */
    outrasReceitas?: { codigo: string; valor: string }[];
    // Resultado impresso na guia (preenchido ao gerar o PDF)
    vt: string;
    vti: string;
    vf: string;
    textoAdicional?: string;
  };
}

const initialFormData: FormData = {
  secretariaUF: "",
  importador: {
    nome: "",
    inscricaoEstadual: "",
    cnpj: "",
    cnae: "",
    endereco: "",
    bairro: "",
    cep: "",
    municipio: "",
    uf: "",
    telefone: "",
  },
  adquirente: {
    nome: "",
    inscricaoEstadual: "",
    cnpj: "",
    cnae: "",
    endereco: "",
    bairro: "",
    cep: "",
    municipio: "",
    uf: "",
    telefone: "",
  },
  documento: {
    tipo: [],
    numero: "",
    dataRegistro: "",
    valorCIF: "",
    nomeRecinto: "",
    codRecinto: "",
    ufDesembaraco: "",
  },
  numeroAdicao: "",
  valorCIFAdicion: "",
  produtos: [
    {
      adicao: "",
      classeTarifaria: "",
      ncm: "",
      tratamento: "3",
      fundamentoLegal: "",
      valor: "",
    },
  ],
  icmsCalculo: {
    editalDBF: "",
    valorCIF: "",
    impostos: "",
    taxaSiscomex: "",
    outrasDespesas: "",
    iofCambio: "",
    afrmm: "",
    incluirAFRMM: false,
    vt: "",
    vti: "",
    vf: "",
  },
};

export function useGLMEForm() {
  const [storedFormData, setStoredFormData, clearStoredFormData] = useLocalStorage<FormData>(
    initialFormData,
    "glme_formulario_data"
  );
  const [formData, setFormData] = useState<FormData>(storedFormData);

  // Sincronizar formData com localStorage
  useEffect(() => {
    setStoredFormData(formData);
  }, [formData, setStoredFormData]);

  const updateField = useCallback(
    (path: string, value: any) => {
      setFormData((prev) => {
        const keys = path.split(".");
        const newData = JSON.parse(JSON.stringify(prev));

        let current = newData;
        for (let i = 0; i < keys.length - 1; i++) {
          if (!current[keys[i]]) {
            current[keys[i]] = {};
          }
          current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;

        // Sincronizar campos automáticos
        if (path === "numeroAdicao") {
          newData.produtos[0].adicao = value;
        }
        // O valor aduaneiro da declaração alimenta o cálculo pelos totais.
        // VT, VTI e VF não são gravados aqui: o cálculo é derivado do formulário
        // (lib/calculoFormulario) e refeito a cada alteração de qualquer campo.
        if (path === "valorCIFAdicion") {
          newData.icmsCalculo.valorCIF = value;
        }

        return newData;
      });
    },
    []
  );

  const updateImportador = useCallback((field: string, value: any) => {
    updateField(`importador.${field}`, value);
  }, [updateField]);

  const updateAdquirente = useCallback((field: string, value: any) => {
    updateField(`adquirente.${field}`, value);
  }, [updateField]);

  const updateDocumento = useCallback((field: string, value: any) => {
    updateField(`documento.${field}`, value);
  }, [updateField]);

  const updateProduto = useCallback(
    (index: number, field: string, value: any) => {
      updateField(`produtos.${index}.${field}`, value);
    },
    [updateField]
  );

  const updateTributada = useCallback(
    (index: number, field: string, value: any) => {
      updateField(`adicoesTributadas.${index}.${field}`, value);
    },
    [updateField]
  );

  const updateICMSCalculo = useCallback((field: string, value: any) => {
    updateField(`icmsCalculo.${field}`, value);
  }, [updateField]);

  const addProduto = useCallback(() => {
    setFormData((prev) => ({
      ...prev,
      produtos: [
        ...prev.produtos,
        {
          adicao: "",
          classeTarifaria: "",
          ncm: "",
          tratamento: "3",
          fundamentoLegal: "",
          valor: "",
        },
      ],
    }));
  }, []);

  const removeProduto = useCallback((index: number) => {
    setFormData((prev) => ({
      ...prev,
      produtos: prev.produtos.filter((_, i) => i !== index),
    }));
  }, []);

  /** Substitui todas as adições de uma vez (importação de DI/DUIMP). */
  const substituirAdicoes = useCallback((produtos: ProdutoAdicao[], tributadas: AdicaoTributada[]) => {
    setFormData((prev) => ({
      ...prev,
      produtos: produtos.length > 0 ? produtos : initialFormData.produtos,
      adicoesTributadas: tributadas,
    }));
  }, []);

  const resetForm = useCallback(() => {
    setFormData(initialFormData);
    clearStoredFormData();
  }, [clearStoredFormData]);

  const exportarJSON = useCallback(() => {
    const dataStr = JSON.stringify(formData, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `glme_formulario_${new Date().toISOString().split("T")[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [formData]);

  const importarJSON = useCallback((jsonData: FormData) => {
    try {
      setFormData(jsonData);
      setStoredFormData(jsonData);
    } catch (error) {
      console.error("Erro ao importar dados:", error);
    }
  }, [setStoredFormData]);

  return {
    formData,
    updateField,
    updateImportador,
    updateAdquirente,
    updateDocumento,
    updateProduto,
    updateTributada,
    updateICMSCalculo,
    addProduto,
    removeProduto,
    substituirAdicoes,
    resetForm,
    exportarJSON,
    importarJSON,
  };
}
