import { describe, it, expect, beforeEach } from 'vitest'
import { useDebugMode } from './useDebugMode'

/**
 * Tests for useDebugMode composable.
 *
 * Key invariants tested:
 * 1. Selection is cleared when debug mode is disabled
 * 2. Selection can only be made when debug mode is enabled
 * 3. Selecting the same item toggles it off
 * 4. Multiple calls to useDebugMode share the same state (singleton pattern)
 */

// Helper to get fresh composable instance
function getComposable() {
  return useDebugMode()
}

// Reset state before each test to avoid test interference
// Since this uses module-level state, we need to reset it
beforeEach(() => {
  const { setDebugMode, clearSelection } = getComposable()
  // Reset to known state (debug mode on, no selection)
  setDebugMode(true)
  clearSelection()
})

describe('useDebugMode', () => {
  describe('debug mode toggle', () => {
    it('starts with debug mode enabled', () => {
      const { debugMode } = getComposable()
      // Note: In the actual code it starts true, but beforeEach resets it
      expect(debugMode.value).toBe(true)
    })

    it('setDebugMode(false) disables debug mode', () => {
      const { setDebugMode, debugMode } = getComposable()
      setDebugMode(false)
      expect(debugMode.value).toBe(false)
    })

    it('setDebugMode(true) enables debug mode', () => {
      const { setDebugMode, debugMode } = getComposable()
      setDebugMode(false)
      setDebugMode(true)
      expect(debugMode.value).toBe(true)
    })

    it('toggleDebugMode flips debug mode state', () => {
      const { toggleDebugMode, debugMode } = getComposable()

      expect(debugMode.value).toBe(true)

      toggleDebugMode()
      expect(debugMode.value).toBe(false)

      toggleDebugMode()
      expect(debugMode.value).toBe(true)
    })
  })

  describe('selection when debug mode is enabled', () => {
    it('can select a node', () => {
      const { selectNode, selection } = getComposable()

      selectNode('node-1')

      expect(selection.value).toEqual({ type: 'node', nodeId: 'node-1' })
    })

    it('can select an edge', () => {
      const { selectEdge, selection } = getComposable()

      selectEdge('parent-1', 'child-1', 0)

      expect(selection.value).toEqual({
        type: 'edge',
        parentId: 'parent-1',
        childId: 'child-1',
        childIndex: 0,
      })
    })

    it('selecting a different node replaces previous selection', () => {
      const { selectNode, selection } = getComposable()

      selectNode('node-1')
      expect(selection.value?.type).toBe('node')

      selectNode('node-2')
      expect(selection.value).toEqual({ type: 'node', nodeId: 'node-2' })
    })

    it('selecting an edge after a node replaces the node selection', () => {
      const { selectNode, selectEdge, selection } = getComposable()

      selectNode('node-1')
      expect(selection.value?.type).toBe('node')

      selectEdge('parent-1', 'child-1', 0)
      expect(selection.value?.type).toBe('edge')
    })
  })

  describe('selection toggle behavior (INVARIANT: same selection toggles off)', () => {
    it('selecting the same node toggles selection off', () => {
      const { selectNode, selection } = getComposable()

      selectNode('node-1')
      expect(selection.value).not.toBeNull()

      selectNode('node-1')
      expect(selection.value).toBeNull()
    })

    it('selecting the same edge toggles selection off', () => {
      const { selectEdge, selection } = getComposable()

      selectEdge('parent-1', 'child-1', 0)
      expect(selection.value).not.toBeNull()

      selectEdge('parent-1', 'child-1', 0)
      expect(selection.value).toBeNull()
    })

    it('selecting a DIFFERENT edge does NOT toggle off', () => {
      const { selectEdge, selection } = getComposable()

      selectEdge('parent-1', 'child-1', 0)
      expect(selection.value).not.toBeNull()

      selectEdge('parent-1', 'child-2', 1)
      expect(selection.value).toEqual({
        type: 'edge',
        parentId: 'parent-1',
        childId: 'child-2',
        childIndex: 1,
      })
    })
  })

  describe('selection clearing (INVARIANT: disabling debug clears selection)', () => {
    it('disabling debug mode clears node selection', () => {
      const { selectNode, setDebugMode, selection } = getComposable()

      selectNode('node-1')
      expect(selection.value).not.toBeNull()

      setDebugMode(false)
      expect(selection.value).toBeNull()
    })

    it('disabling debug mode clears edge selection', () => {
      const { selectEdge, setDebugMode, selection } = getComposable()

      selectEdge('parent-1', 'child-1', 0)
      expect(selection.value).not.toBeNull()

      setDebugMode(false)
      expect(selection.value).toBeNull()
    })

    it('clearSelection explicitly clears any selection', () => {
      const { selectNode, clearSelection, selection } = getComposable()

      selectNode('node-1')
      expect(selection.value).not.toBeNull()

      clearSelection()
      expect(selection.value).toBeNull()
    })
  })

  describe('selection blocked when debug disabled (INVARIANT)', () => {
    it('cannot select node when debug mode is disabled', () => {
      const { setDebugMode, selectNode, selection } = getComposable()

      setDebugMode(false)
      selectNode('node-1')

      expect(selection.value).toBeNull()
    })

    it('cannot select edge when debug mode is disabled', () => {
      const { setDebugMode, selectEdge, selection } = getComposable()

      setDebugMode(false)
      selectEdge('parent-1', 'child-1', 0)

      expect(selection.value).toBeNull()
    })

    it('re-enabling debug mode allows selection again', () => {
      const { setDebugMode, selectNode, selection } = getComposable()

      setDebugMode(false)
      selectNode('node-1')
      expect(selection.value).toBeNull()

      setDebugMode(true)
      selectNode('node-1')
      expect(selection.value).toEqual({ type: 'node', nodeId: 'node-1' })
    })
  })

  describe('singleton pattern', () => {
    it('multiple calls to useDebugMode share the same state', () => {
      const composable1 = useDebugMode()
      const composable2 = useDebugMode()

      composable1.selectNode('shared-node')

      // composable2 should see the same selection
      expect(composable2.selection.value).toEqual({
        type: 'node',
        nodeId: 'shared-node',
      })

      // And changes from composable2 should be visible to composable1
      composable2.clearSelection()
      expect(composable1.selection.value).toBeNull()
    })
  })
})
