import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "glme_formulario_data";

export function useLocalStorage<T>(
  initialValue: T,
  key: string = STORAGE_KEY
) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      // Tentar recuperar do localStorage
      if (typeof window !== "undefined") {
        const item = window.localStorage.getItem(key);
        return item ? JSON.parse(item) : initialValue;
      }
      return initialValue;
    } catch (error) {
      console.error("Erro ao recuperar dados do localStorage:", error);
      return initialValue;
    }
  });

  // Salvar no localStorage sempre que o valor mudar
  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        const valueToStore =
          value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);

        if (typeof window !== "undefined") {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
      } catch (error) {
        console.error("Erro ao salvar dados no localStorage:", error);
      }
    },
    [key, storedValue]
  );

  // Função para limpar o localStorage
  const clearStorage = useCallback(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(key);
      }
      setStoredValue(initialValue);
    } catch (error) {
      console.error("Erro ao limpar localStorage:", error);
    }
  }, [key, initialValue]);

  return [storedValue, setValue, clearStorage] as const;
}
