'use client';

// ponytail: demo simulation only; real change is PATCH /accounts/:id/role
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { UserRole } from '@encre-et-plume/shared';
import { useSession } from './session';

interface RoleSimCtx {
  effectiveRole: UserRole;
  setSimulatedRole: (role: UserRole | null) => void;
}

const RoleSimContext = createContext<RoleSimCtx>({
  effectiveRole: 'utilisateur',
  setSimulatedRole: () => {},
});

export function RoleSimulationProvider({ children }: { children: ReactNode }) {
  const { account } = useSession();
  const [simulatedRole, setSimulatedRole] = useState<UserRole | null>(null);
  const effectiveRole: UserRole = simulatedRole ?? account?.role ?? 'utilisateur';

  return (
    <RoleSimContext.Provider value={{ effectiveRole, setSimulatedRole }}>
      {children}
    </RoleSimContext.Provider>
  );
}

export const useEffectiveRole = () => useContext(RoleSimContext);
