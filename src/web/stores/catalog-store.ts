import { create } from 'zustand';
import type { EventCatalogResponseDTO, ProductDTO } from '@contract/index';
import { fetchEventCatalog } from '../api/endpoints';
import { ApiClientError } from '../api/http';

interface CatalogState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  catalog: EventCatalogResponseDTO | null;
  errorMessage: string | null;
  loadCatalog: (force?: boolean) => Promise<void>;
  getProduct: (code: ProductDTO['code']) => ProductDTO | undefined;
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  status: 'idle',
  catalog: null,
  errorMessage: null,

  loadCatalog: async (force = false) => {
    const current = get().status;
    if (!force && (current === 'loading' || current === 'ready')) {
      return;
    }
    set({ status: 'loading', errorMessage: null });
    try {
      const catalog = await fetchEventCatalog();
      set({ status: 'ready', catalog, errorMessage: null });
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : 'Unable to load festival catalog and ticket availability.';
      set({ status: 'error', errorMessage: message });
    }
  },

  getProduct: (code) => get().catalog?.products.find((p) => p.code === code),
}));
