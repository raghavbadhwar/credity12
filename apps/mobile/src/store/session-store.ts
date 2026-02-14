import { create } from 'zustand';
import type { AppRole, RoleSession } from '../types';

const emptySession = (): RoleSession => ({
  accessToken: null,
  refreshToken: null,
  user: null,
});

interface SessionState {
  activeRole: AppRole | null;
  sessions: Record<AppRole, RoleSession>;
  setActiveRole: (role: AppRole | null) => void;
  setSession: (role: AppRole, session: Partial<RoleSession>) => void;
  clearSession: (role: AppRole) => void;
  clearAll: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  activeRole: null,
  sessions: {
    holder: emptySession(),
    issuer: emptySession(),
    recruiter: emptySession(),
  },
  setActiveRole: (role) => set({ activeRole: role }),
  setSession: (role, session) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [role]: {
          ...state.sessions[role],
          ...session,
        },
      },
    })),
  clearSession: (role) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [role]: emptySession(),
      },
    })),
  clearAll: () =>
    set({
      activeRole: null,
      sessions: {
        holder: emptySession(),
        issuer: emptySession(),
        recruiter: emptySession(),
      },
    }),
}));
