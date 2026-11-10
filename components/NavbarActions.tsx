"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

type AddAction = { label: string; onClick: () => void };

const NavbarActionsContext = createContext<{
  addAction: AddAction | null;
  setAddAction: Dispatch<SetStateAction<AddAction | null>>;
} | null>(null);

export function NavbarActionsProvider({ children }: { children: ReactNode }) {
  const [addAction, setAddAction] = useState<AddAction | null>(null);
  const value = useMemo(() => ({ addAction, setAddAction }), [addAction]);

  return (
    <NavbarActionsContext.Provider value={value}>
      {children}
    </NavbarActionsContext.Provider>
  );
}

export function useNavbarActions() {
  const context = useContext(NavbarActionsContext);
  if (!context) throw new Error("NavbarActionsProvider is missing");
  return context;
}

// The page keeps ownership of its form while the navbar hosts its add action.
export function useNavbarAddAction(label: string, onClick: () => void) {
  const { setAddAction } = useNavbarActions();
  useEffect(() => {
    setAddAction({ label, onClick });
    return () => setAddAction(null);
  }, [label, onClick, setAddAction]);
}
