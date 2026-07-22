import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import AdClosedEarlyModal from "@/components/AdClosedEarlyModal";

interface AdGateCtx { showClosedEarly: () => void; }
const Ctx = createContext<AdGateCtx>({ showClosedEarly: () => {} });

export function AdGateProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const showClosedEarly = useCallback(() => setOpen(true), []);
  return (
    <Ctx.Provider value={{ showClosedEarly }}>
      {children}
      <AdClosedEarlyModal open={open} onClose={() => setOpen(false)} />
    </Ctx.Provider>
  );
}

export function useAdGate() { return useContext(Ctx); }
