import { ref, computed } from 'vue'

/**
 * Canvas view state (pan and zoom) stored per-example.
 *
 * Each example has its own independent view state, like separate documents
 * in a word processor. Pan/zoom in one example doesn't affect others.
 *
 * Default positioning places the tree with:
 * - Left boundary at horizontalGap from canvas left edge
 * - Root top at verticalGap from canvas top edge
 */

interface ViewState {
  panOffset: { x: number; y: number }
  zoom: number
  // Track whether user has manually panned or zoomed in this example
  // When true, layout algorithm switches preserve root position
  userHasInteracted: boolean
}

function createDefaultViewState(): ViewState {
  return {
    panOffset: { x: 0, y: 0 },
    zoom: 1,
    userHasInteracted: false,
  }
}

// Store view state per example ID
const viewStateMap = new Map<string, ViewState>()

// Current example ID being viewed
const currentExampleId = ref<string>('')

// Reactive trigger - increment this to force computed refs to re-evaluate
// This is needed because the ViewState objects in the Map aren't reactive
const stateVersion = ref(0)

// Get or create view state for current example
function getCurrentViewState(): ViewState {
  const id = currentExampleId.value
  if (!id) {
    // No example selected, use a default state
    return createDefaultViewState()
  }
  if (!viewStateMap.has(id)) {
    viewStateMap.set(id, createDefaultViewState())
  }
  return viewStateMap.get(id)!
}

// Notify that state has changed (for reactivity)
function notifyStateChange() {
  stateVersion.value++
}

export function useCanvasView() {
  // Computed refs that read from per-example state
  // Include stateVersion.value to ensure reactivity when state changes
  const panOffset = computed(() => {
    void stateVersion.value // dependency for reactivity
    return getCurrentViewState().panOffset
  })
  const zoom = computed(() => {
    void stateVersion.value // dependency for reactivity
    return getCurrentViewState().zoom
  })
  const userHasInteracted = computed(() => {
    void stateVersion.value // dependency for reactivity
    return getCurrentViewState().userHasInteracted
  })

  /**
   * Set the current example ID. Called when switching examples.
   * Each example maintains its own independent view state.
   */
  function setCurrentExample(exampleId: string) {
    currentExampleId.value = exampleId
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
    notifyStateChange()
  }

  /**
   * Mark that user has manually interacted with the view.
   * After this, algorithm switches will preserve root position.
   */
  function markUserInteraction() {
    const state = getCurrentViewState()
    state.userHasInteracted = true
    notifyStateChange()
  }

  /**
   * Clear the user interaction flag without resetting the view.
   * Used when we want to apply default positioning on next draw.
   */
  function clearUserInteraction() {
    const state = getCurrentViewState()
    state.userHasInteracted = false
    notifyStateChange()
  }

  /**
   * Apply pan offset (used during dragging).
   * Does NOT set userHasInteracted - that's set separately by markUserInteraction.
   */
  function applyPanDelta(dx: number, dy: number) {
    const state = getCurrentViewState()
    state.panOffset.x += dx
    state.panOffset.y += dy
    notifyStateChange()
  }

  /**
   * Set zoom level with bounds checking.
   * Does NOT set userHasInteracted - that's set separately.
   */
  function setZoom(newZoom: number) {
    const state = getCurrentViewState()
    state.zoom = Math.max(0.25, Math.min(4, newZoom))
    notifyStateChange()
  }

  /**
   * Set pan offset directly.
   */
  function setPanOffset(x: number, y: number) {
    const state = getCurrentViewState()
    state.panOffset = { x, y }
    notifyStateChange()
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
