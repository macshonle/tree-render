import { describe, it, expect, beforeEach } from 'vitest'
import { createDebugModeStore } from './useDebugMode'

/**
 * Tests for useDebugMode composable.
 *
 * Key invariants tested:
 * 1. Selection is cleared when debug mode is disabled
 * 2. Selection can only be made when debug mode is enabled
 * 3. Selecting the same item toggles it off
 * 4. Store instances are isolated
 */

let store: ReturnType<typeof createDebugModeStore>

beforeEach(() => {
  store = createDebugModeStore(true)
})

describe('useDebugMode', () => {
  describe('debug mode toggle', () => {
    it('starts with debug mode enabled', () => {
      const { debugMode } = store
      // Note: In the actual code it starts true, but beforeEach resets it
      expect(debugMode.value).toBe(true)
    })

    it('setDebugMode(false) disables debug mode', () => {
      const { setDebugMode, debugMode } = store
      setDebugMode(false)
      expect(debugMode.value).toBe(false)
    })

    it('setDebugMode(true) enables debug mode', () => {
      const { setDebugMode, debugMode } = store
      setDebugMode(false)
      setDebugMode(true)
      expect(debugMode.value).toBe(true)
    })

    it('toggleDebugMode flips debug mode state', () => {
      const { toggleDebugMode, debugMode } = store

      expect(debugMode.value).toBe(true)

      toggleDebugMode()
      expect(debugMode.value).toBe(false)

      toggleDebugMode()
      expect(debugMode.value).toBe(true)
    })
  })

  describe('selection when debug mode is enabled', () => {
    it('can select a node', () => {
      const { selectNode, selection } = store

      selectNode('node-1')

      expect(selection.value).toEqual({ type: 'node', nodeId: 'node-1' })
    })

    it('can select an edge', () => {
      const { selectEdge, selection } = store

      selectEdge('parent-1', 'child-1', 0)

      expect(selection.value).toEqual({
        type: 'edge',
        parentId: 'parent-1',
        childId: 'child-1',
        childIndex: 0,
      })
    })

    it('selecting a different node replaces previous selection', () => {
      const { selectNode, selection } = store

      selectNode('node-1')
      expect(selection.value?.type).toBe('node')

      selectNode('node-2')
      expect(selection.value).toEqual({ type: 'node', nodeId: 'node-2' })
    })

    it('selecting an edge after a node replaces the node selection', () => {
      const { selectNode, selectEdge, selection } = store

      selectNode('node-1')
      expect(selection.value?.type).toBe('node')

      selectEdge('parent-1', 'child-1', 0)
      expect(selection.value?.type).toBe('edge')
    })
  })

  describe('selection toggle behavior (INVARIANT: same selection toggles off)', () => {
    it('selecting the same node toggles selection off', () => {
      const { selectNode, selection } = store

      selectNode('node-1')
      expect(selection.value).not.toBeNull()

      selectNode('node-1')
      expect(selection.value).toBeNull()
    })

    it('selecting the same edge toggles selection off', () => {
      const { selectEdge, selection } = store

      selectEdge('parent-1', 'child-1', 0)
      expect(selection.value).not.toBeNull()

      selectEdge('parent-1', 'child-1', 0)
      expect(selection.value).toBeNull()
    })

    it('selecting a DIFFERENT edge does NOT toggle off', () => {
      const { selectEdge, selection } = store

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
      const { selectNode, setDebugMode, selection } = store

      selectNode('node-1')
      expect(selection.value).not.toBeNull()

      setDebugMode(false)
      expect(selection.value).toBeNull()
    })

    it('disabling debug mode clears edge selection', () => {
      const { selectEdge, setDebugMode, selection } = store

      selectEdge('parent-1', 'child-1', 0)
      expect(selection.value).not.toBeNull()

      setDebugMode(false)
      expect(selection.value).toBeNull()
    })

    it('clearSelection explicitly clears any selection', () => {
      const { selectNode, clearSelection, selection } = store

      selectNode('node-1')
      expect(selection.value).not.toBeNull()

      clearSelection()
      expect(selection.value).toBeNull()
    })
  })

  describe('selection blocked when debug disabled (INVARIANT)', () => {
    it('cannot select node when debug mode is disabled', () => {
      const { setDebugMode, selectNode, selection } = store

      setDebugMode(false)
      selectNode('node-1')

      expect(selection.value).toBeNull()
    })

    it('cannot select edge when debug mode is disabled', () => {
      const { setDebugMode, selectEdge, selection } = store

      setDebugMode(false)
      selectEdge('parent-1', 'child-1', 0)

      expect(selection.value).toBeNull()
    })

    it('re-enabling debug mode allows selection again', () => {
      const { setDebugMode, selectNode, selection } = store

      setDebugMode(false)
      selectNode('node-1')
      expect(selection.value).toBeNull()

      setDebugMode(true)
      selectNode('node-1')
      expect(selection.value).toEqual({ type: 'node', nodeId: 'node-1' })
    })
  })

  describe('store instances', () => {
    it('do not share selection or debug state', () => {
      const storeA = createDebugModeStore(true)
      const storeB = createDebugModeStore(true)

      storeA.selectNode('shared-node')

      expect(storeB.selection.value).toBeNull()

      storeB.setDebugMode(false)
      expect(storeA.debugMode.value).toBe(true)
    })
  })
})
