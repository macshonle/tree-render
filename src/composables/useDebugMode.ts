import { ref, computed, provide, inject, type InjectionKey, type ComputedRef } from 'vue'

/**
 * Selection types for debug visualization
 */
export type SelectionType = 'node' | 'edge'

export interface NodeSelection {
  type: 'node'
  nodeId: string
}

export interface EdgeSelection {
  type: 'edge'
  parentId: string
  childId: string
  /** Index of the child among its siblings (for identifying which edge) */
  childIndex: number
}

export type Selection = NodeSelection | EdgeSelection

export interface DebugModeStore {
  debugMode: ComputedRef<boolean>
  selection: ComputedRef<Selection | null>
  setDebugMode: (enabled: boolean) => void
  toggleDebugMode: () => void
  selectNode: (nodeId: string) => void
  selectEdge: (parentId: string, childId: string, childIndex: number) => void
  clearSelection: () => void
}

export function createDebugModeStore(initialEnabled = true): DebugModeStore {
  const debugMode = ref(initialEnabled)
  const selection = ref<Selection | null>(null)
  const isDebugMode = computed(() => debugMode.value)

  function setDebugMode(enabled: boolean) {
    debugMode.value = enabled
    // Clear selection when debug mode is disabled
    if (!enabled) {
      selection.value = null
    }
  }

  function toggleDebugMode() {
    setDebugMode(!debugMode.value)
  }

  function selectNode(nodeId: string) {
    if (!debugMode.value) return

    // Toggle off if already selected
    if (selection.value?.type === 'node' && selection.value.nodeId === nodeId) {
      selection.value = null
    } else {
      selection.value = { type: 'node', nodeId }
    }
  }

  function selectEdge(parentId: string, childId: string, childIndex: number) {
    if (!debugMode.value) return

    // Toggle off if already selected
    if (
      selection.value?.type === 'edge' &&
      selection.value.parentId === parentId &&
      selection.value.childId === childId
    ) {
      selection.value = null
    } else {
      selection.value = { type: 'edge', parentId, childId, childIndex }
    }
  }

  function clearSelection() {
    selection.value = null
  }

  return {
    debugMode: isDebugMode,
    selection: computed(() => selection.value),
    setDebugMode,
    toggleDebugMode,
    selectNode,
    selectEdge,
    clearSelection,
  }
}

const debugModeKey: InjectionKey<DebugModeStore> = Symbol('DebugModeStore')

export function provideDebugMode(store: DebugModeStore) {
  provide(debugModeKey, store)
}

export function useDebugMode(): DebugModeStore {
  const store = inject(debugModeKey)
  if (!store) {
    throw new Error('DebugModeStore is not provided')
  }
  return store
}
