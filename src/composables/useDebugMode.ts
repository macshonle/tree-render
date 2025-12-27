import { ref, computed } from 'vue'

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

/**
 * Global debug mode state
 */
const debugMode = ref(true)
const selection = ref<Selection | null>(null)

/**
 * Composable for debug mode and selection state
 */
export function useDebugMode() {
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
