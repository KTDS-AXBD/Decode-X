import { createContext, useContext, useState, type ReactNode } from "react";
import { DOMAINS, type DomainConfig } from "@/types/demo";

interface DomainContextValue {
  domain: DomainConfig;
  setDomainById: (id: string) => void;
}

const DomainContext = createContext<DomainContextValue | null>(null);

export function DomainProvider({ children }: { children: ReactNode }) {
  const [domain, setDomain] = useState<DomainConfig>(DOMAINS[0]!);

  function setDomainById(id: string) {
    const found = DOMAINS.find((d) => d.id === id);
    if (found) setDomain(found);
  }

  return (
    <DomainContext.Provider value={{ domain, setDomainById }}>
      {children}
    </DomainContext.Provider>
  );
}

export function useDomain(): DomainContextValue {
  const ctx = useContext(DomainContext);
  if (!ctx) throw new Error("useDomain must be used within DomainProvider");
  return ctx;
}
