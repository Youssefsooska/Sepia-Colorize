/**
 * Zustand store holding all saved colors and user-created collections.
 *
 * State shape is keyed by id for O(1) lookup + a `collectionOrder` array to
 * preserve user-controlled sort order on the drawer page. Persistence is
 * handled by zustand/middleware's `persist` over localStorage so state
 * survives app restarts. electron-store is reserved for the main process.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { SavedColor, Collection } from '../types';

interface ColorStoreState {
  colors: Record<string, SavedColor>;
  collections: Record<string, Collection>;
  collectionOrder: string[];

  addColor: (
    color: Omit<SavedColor, 'id' | 'collectionIds'> & { collectionIds?: string[] },
  ) => SavedColor;
  deleteColor: (colorId: string) => void;
  moveColorToCollection: (colorId: string, collectionId: string) => void;
  removeColorFromCollection: (colorId: string, collectionId: string) => void;

  createCollection: (name: string) => Collection;
  renameCollection: (collectionId: string, name: string) => void;
  deleteCollection: (collectionId: string) => void;
  toggleCollectionExpanded: (collectionId: string) => void;
  reorderColorInCollection: (collectionId: string, colorId: string, toIndex: number) => void;

  getAllColorsSortedByNewest: () => SavedColor[];
  getColorsInCollection: (collectionId: string) => SavedColor[];
}

// Defensive localStorage accessor — returns a no-op store in non-browser
// contexts so imports don't crash during SSR-like environments (e.g. tests).
const safeStorage = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  const mem: Record<string, string> = {};
  return {
    getItem: (k: string) => mem[k] ?? null,
    setItem: (k: string, v: string) => { mem[k] = v; },
    removeItem: (k: string) => { delete mem[k]; },
  } as Storage;
};

export const useColorStore = create<ColorStoreState>()(
  persist(
    (set, get) => ({
      colors: {},
      collections: {},
      collectionOrder: [],

      addColor: (partial) => {
        const id = uuidv4();
        const collectionIds = partial.collectionIds ?? [];
        const color: SavedColor = { ...partial, id, collectionIds };
        set((state) => {
          // Prepend to each specified collection so newest-first ordering holds.
          const nextCollections = { ...state.collections };
          for (const cid of collectionIds) {
            const c = nextCollections[cid];
            if (c) nextCollections[cid] = { ...c, colorIds: [id, ...c.colorIds] };
          }
          return {
            colors: { ...state.colors, [id]: color },
            collections: nextCollections,
          };
        });
        return color;
      },

      deleteColor: (colorId) => {
        set((state) => {
          const { [colorId]: _removed, ...restColors } = state.colors;
          void _removed;
          const nextCollections: Record<string, Collection> = {};
          for (const [cid, col] of Object.entries(state.collections)) {
            nextCollections[cid] = {
              ...col,
              colorIds: col.colorIds.filter((id) => id !== colorId),
            };
          }
          return { colors: restColors, collections: nextCollections };
        });
      },

      moveColorToCollection: (colorId, collectionId) => {
        set((state) => {
          const color = state.colors[colorId];
          const col = state.collections[collectionId];
          if (!color || !col) return state;
          if (col.colorIds.includes(colorId)) return state;
          return {
            colors: {
              ...state.colors,
              [colorId]: {
                ...color,
                collectionIds: Array.from(new Set([...color.collectionIds, collectionId])),
              },
            },
            collections: {
              ...state.collections,
              [collectionId]: { ...col, colorIds: [colorId, ...col.colorIds] },
            },
          };
        });
      },

      removeColorFromCollection: (colorId, collectionId) => {
        set((state) => {
          const color = state.colors[colorId];
          const col = state.collections[collectionId];
          if (!color || !col) return state;
          return {
            colors: {
              ...state.colors,
              [colorId]: {
                ...color,
                collectionIds: color.collectionIds.filter((id) => id !== collectionId),
              },
            },
            collections: {
              ...state.collections,
              [collectionId]: {
                ...col,
                colorIds: col.colorIds.filter((id) => id !== colorId),
              },
            },
          };
        });
      },

      createCollection: (name) => {
        const id = uuidv4();
        const collection: Collection = {
          id,
          name: name.trim() || 'New Collection',
          colorIds: [],
          createdAt: Date.now(),
          isExpanded: true,
        };
        set((state) => ({
          collections: { ...state.collections, [id]: collection },
          collectionOrder: [...state.collectionOrder, id],
        }));
        return collection;
      },

      renameCollection: (collectionId, name) => {
        set((state) => {
          const col = state.collections[collectionId];
          if (!col) return state;
          return {
            collections: {
              ...state.collections,
              [collectionId]: { ...col, name: name.trim() || col.name },
            },
          };
        });
      },

      deleteCollection: (collectionId) => {
        set((state) => {
          const { [collectionId]: _removed, ...rest } = state.collections;
          void _removed;
          const nextColors: Record<string, SavedColor> = {};
          for (const [cid, color] of Object.entries(state.colors)) {
            nextColors[cid] = {
              ...color,
              collectionIds: color.collectionIds.filter((id) => id !== collectionId),
            };
          }
          return {
            collections: rest,
            collectionOrder: state.collectionOrder.filter((id) => id !== collectionId),
            colors: nextColors,
          };
        });
      },

      toggleCollectionExpanded: (collectionId) => {
        set((state) => {
          const col = state.collections[collectionId];
          if (!col) return state;
          return {
            collections: {
              ...state.collections,
              [collectionId]: { ...col, isExpanded: !col.isExpanded },
            },
          };
        });
      },

      reorderColorInCollection: (collectionId, colorId, toIndex) => {
        set((state) => {
          const col = state.collections[collectionId];
          if (!col) return state;
          const next = col.colorIds.filter((id) => id !== colorId);
          const clamped = Math.max(0, Math.min(toIndex, next.length));
          next.splice(clamped, 0, colorId);
          return {
            collections: {
              ...state.collections,
              [collectionId]: { ...col, colorIds: next },
            },
          };
        });
      },

      getAllColorsSortedByNewest: () => {
        const { colors } = get();
        return Object.values(colors).sort((a, b) => b.timestamp - a.timestamp);
      },

      getColorsInCollection: (collectionId) => {
        const { collections, colors } = get();
        const col = collections[collectionId];
        if (!col) return [];
        return col.colorIds.map((id) => colors[id]).filter((x): x is SavedColor => !!x);
      },
    }),
    {
      name: 'sepia:colors',
      storage: createJSONStorage(safeStorage),
      partialize: (state) => ({
        colors: state.colors,
        collections: state.collections,
        collectionOrder: state.collectionOrder,
      }),
    },
  ),
);
