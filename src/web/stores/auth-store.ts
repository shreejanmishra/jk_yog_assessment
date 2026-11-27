import { create } from 'zustand';
import type { UserProfileDTO } from '@contract/index';
import {
  fetchAuthSession,
  requestEmailOtp,
  signInWithDemoProfile,
  signOutProfile,
  updateMyProfile,
  verifyEmailOtp,
} from '../api/endpoints';

interface AuthState {
  initialized: boolean;
  loading: boolean;
  user: UserProfileDTO | null;
  signInModalOpen: boolean;
  hydrateSession: () => Promise<void>;
  openSignInModal: () => void;
  closeSignInModal: () => void;
  loginDemo: () => Promise<UserProfileDTO>;
  sendOtp: (email: string, fullName?: string, phone?: string) => Promise<string>;
  confirmOtp: (email: string, code: string, fullName?: string, phone?: string) => Promise<UserProfileDTO>;
  saveProfile: (fullName: string, phone: string) => Promise<UserProfileDTO>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  initialized: false,
  loading: false,
  user: null,
  signInModalOpen: false,

  hydrateSession: async () => {
    if (get().initialized) return;
    try {
      const res = await fetchAuthSession();
      set({ initialized: true, user: res.user });
    } catch {
      set({ initialized: true, user: null });
    }
  },

  openSignInModal: () => set({ signInModalOpen: true }),
  closeSignInModal: () => set({ signInModalOpen: false }),

  loginDemo: async () => {
    set({ loading: true });
    try {
      const res = await signInWithDemoProfile();
      set({ user: res.user, loading: false, signInModalOpen: false });
      return res.user!;
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  sendOtp: async (email, fullName, phone) => {
    const res = await requestEmailOtp({ email, fullName, phone });
    return res.simulatedOtpCode;
  },

  confirmOtp: async (email, code, fullName, phone) => {
    set({ loading: true });
    try {
      const res = await verifyEmailOtp({ email, code, fullName, phone });
      set({ user: res.user, loading: false, signInModalOpen: false });
      return res.user!;
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  saveProfile: async (fullName, phone) => {
    const updated = await updateMyProfile({ fullName, phone });
    set({ user: updated });
    return updated;
  },

  logout: async () => {
    await signOutProfile();
    set({ user: null });
  },
}));
