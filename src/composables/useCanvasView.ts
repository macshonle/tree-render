import { ref, computed, reactive, provide, inject, type InjectionKey, type Ref, type ComputedRef } from 'vue'

/**
 * Canvas view state (pan and zoom) stored per-example.
 *
 * Each example has its own independent view state, like separate documents
 * in a word processor. Pan/zoom in one example doesn't affect others.
 *
 * Default positioning places the tree with:
 * - Left boundary at horizontalGap from canvas left edge
 * - Root top at horizontalGap from canvas top edge
 */

interface ViewState {
  panOffset: { x: number; y: number }
  zoom: number
  // Track whether user has manually panned or zoomed in this example
  // When true, layout algorithm switches preserve root position
  userHasInteracted: boolean
}

export interface CanvasViewStore {
  panOffset: ComputedRef<{ x: number; y: number }>
  zoom: ComputedRef<number>
  userHasInteracted: ComputedRef<boolean>
  currentExampleId: Ref<string>
  setCurrentExample: (exampleId: string) => void
  resetView: () => void
  markUserInteraction: () => void
  clearUserInteraction: () => void
  applyPanDelta: (dx: number, dy: number) => void
  setZoom: (newZoom: number) => void
  setPanOffset: (x: number, y: number) => void
  getPanOffset: () => { x: number; y: number }
  getZoom: () => number
  hasUserInteracted: () => boolean
}

function createDefaultViewState(): ViewState {
  return {
    panOffset: { x: 0, y: 0 },
    zoom: 1,
    userHasInteracted: false,
  }
}

// Maximum number of view states to cache before pruning old entries
const MAX_CACHED_VIEW_STATES = 50

export function createCanvasViewStore(): CanvasViewStore {
  // Store view state per example ID
  const viewStates = reactive<Record<string, ViewState>>({})

  // Track access order for LRU-style cleanup (most recent last)
  const accessOrder: string[] = []

  // Current example ID being viewed
  const currentExampleId = ref<string>('')

  /**
   * Update access order for LRU tracking.
   * Moves the given ID to the end (most recently used).
   */
  function touchAccessOrder(id: string) {
    const existingIndex = accessOrder.indexOf(id)
    if (existingIndex !== -1) {
      accessOrder.splice(existingIndex, 1)
    }
    accessOrder.push(id)
  }

  /**
   * Prune oldest view states if we exceed the cache limit.
   * Removes least recently used entries first.
   */
  function pruneOldViewStates() {
    while (accessOrder.length > MAX_CACHED_VIEW_STATES) {
      const oldestId = accessOrder.shift()
      if (oldestId && oldestId !== currentExampleId.value) {
        delete viewStates[oldestId]
      }
    }
  }

  // Get or create view state for current example
  function getCurrentViewState(): ViewState {
    const id = currentExampleId.value
    if (!id) {
      // No example selected, use a default state
      return createDefaultViewState()
    }
    if (!viewStates[id]) {
      viewStates[id] = createDefaultViewState()
    }
    return viewStates[id]
  }

  // Computed refs that read from per-example state
  const panOffset = computed(() => getCurrentViewState().panOffset)
  const zoom = computed(() => getCurrentViewState().zoom)
  const userHasInteracted = computed(() => getCurrentViewState().userHasInteracted)

  /**
   * Set the current example ID. Called when switching examples.
   * Each example maintains its own independent view state.
   * Uses LRU-style cleanup to prevent unbounded memory growth.
   */
  function setCurrentExample(exampleId: string) {
    currentExampleId.value = exampleId
    if (exampleId) {
      touchAccessOrder(exampleId)
      if (!viewStates[exampleId]) {
        viewStates[exampleId] = createDefaultViewState()
      }
      pruneOldViewStates()
    }
  }

  /**
   * Reset view to default state (100% zoom, no pan offset).
   * Also clears the user interaction flag.
   */
  function resetView() {
    const state = getCurrentViewState()
    state.panOffset = { x: 0, y: 0 }
    state.zoom = 1
    state.userHasInteracted = false
  }

  /**
   * Mark that user has manually interacted with the view.
   * After this, algorithm switches will preserve root position.
   */
  function markUserInteraction() {
    const state = getCurrentViewState()
    state.userHasInteracted = true
  }

  /**
   * Clear the user interaction flag without resetting the view.
   * Used when we want to apply default positioning on next draw.
   */
  function clearUserInteraction() {
    const state = getCurrentViewState()
    state.userHasInteracted = false
  }

  /**
   * Apply pan offset (used during dragging).
   * Does NOT set userHasInteracted - that's set separately by markUserInteraction.
   */
  function applyPanDelta(dx: number, dy: number) {
    const state = getCurrentViewState()
    state.panOffset.x += dx
    state.panOffset.y += dy
  }

  /**
   * Set zoom level with bounds checking.
   * Does NOT set userHasInteracted - that's set separately.
   */
  function setZoom(newZoom: number) {
    const state = getCurrentViewState()
    state.zoom = Math.max(0.25, Math.min(4, newZoom))
  }

  /**
   * Set pan offset directly.
   */
  function setPanOffset(x: number, y: number) {
    const state = getCurrentViewState()
    state.panOffset = { x, y }
  }

  /**
   * Get the raw pan offset values (for reading in draw loop)
   */
  function getPanOffset(): { x: number; y: number } {
    return getCurrentViewState().panOffset
  }

  /**
   * Get the raw zoom value (for reading in draw loop)
   */
  function getZoom(): number {
    return getCurrentViewState().zoom
  }

  /**
   * Check if user has interacted (for reading in draw loop)
   */
  function hasUserInteracted(): boolean {
    return getCurrentViewState().userHasInteracted
  }

  return {
    panOffset,
    zoom,
    userHasInteracted,
    currentExampleId,
    setCurrentExample,
    resetView,
    markUserInteraction,
    clearUserInteraction,
    applyPanDelta,
    setZoom,
    setPanOffset,
    getPanOffset,
    getZoom,
    hasUserInteracted,
  }
}

const canvasViewKey: InjectionKey<CanvasViewStore> = Symbol('CanvasViewStore')

export function provideCanvasView(store: CanvasViewStore) {
  provide(canvasViewKey, store)
}

export function useCanvasView(): CanvasViewStore {
  const store = inject(canvasViewKey)
  if (!store) {
    throw new Error('CanvasViewStore is not provided')
  }
  return store
}
