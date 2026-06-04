import { useState, useCallback, useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";

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

  // Seção 5 - Produtos sem recolhimento do ICMS
  produtos: Array<{
    adicao: string;
    classeTarifaria: string;
    ncm: string;
    tratamento: string;
    fundamentoLegal: string;
    valor: string;
  }>;

  // Seção 5.4 - Cálculos de ICMS
  icmsCalculo: {
    editalDBF: string;
    valorCIF: string;
    impostos: string;
    vt: string; // VT = Valor CIF + Impostos
    vti: string; // VTI = VT / 0,795
    vf: string; // VF = VTI * 20,5%
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
        if (path === "valorCIFAdicion") {
          newData.icmsCalculo.valorCIF = value;
          // Recalcular VT
          const impostos = parseFloat(newData.icmsCalculo.impostos) || 0;
          const cif = parseFloat(value) || 0;
          const vt = cif + impostos;
          newData.icmsCalculo.vt = vt.toFixed(2);
          // Recalcular VTI
          const vti = vt / 0.795;
          newData.icmsCalculo.vti = vti.toFixed(2);
          // Recalcular VF
          const vf = vti * 0.205;
          newData.icmsCalculo.vf = vf.toFixed(2);
        }
        if (path === "icmsCalculo.impostos") {
          // Recalcular VT
          const cif = parseFloat(newData.icmsCalculo.valorCIF) || 0;
          const impostos = parseFloat(value) || 0;
          const vt = cif + impostos;
          newData.icmsCalculo.vt = vt.toFixed(2);
          // Recalcular VTI
          const vti = vt / 0.795;
          newData.icmsCalculo.vti = vti.toFixed(2);
          // Recalcular VF
          const vf = vti * 0.205;
          newData.icmsCalculo.vf = vf.toFixed(2);
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
    updateICMSCalculo,
    addProduto,
    removeProduto,
    resetForm,
    exportarJSON,
    importarJSON,
  };
}
