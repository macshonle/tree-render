import { describe, it, expect, beforeEach } from 'vitest'
import { useTreeStyle } from './useTreeStyle'
import { defaultTreeStyle } from '@/types'

/**
 * Tests for useTreeStyle composable.
 *
 * Key invariants tested:
 * 1. resetStyle restores all values to defaults
 * 2. applyExampleStyle merges with defaults (not replaces entirely)
 * 3. Direct mutations to treeStyle are reactive
 * 4. exportStyle/importStyle round-trip preserves data
 * 5. importStyle validates structure
 * 6. Multiple calls share the same state (singleton pattern)
 */

function getComposable() {
  return useTreeStyle()
}

// Reset to default state before each test
beforeEach(() => {
  const { resetStyle } = getComposable()
  resetStyle()
})

describe('useTreeStyle', () => {
  describe('default values', () => {
    it('has correct default node style', () => {
      const { treeStyle } = getComposable()

      expect(treeStyle.value.node).toEqual({
        shape: 'rounded-rectangle',
        fillColor: '#ffffff',
        strokeColor: '#111111',
        strokeWidth: 2,
        padding: 10,
      })
    })

    it('has correct default edge style', () => {
      const { treeStyle } = getComposable()

      expect(treeStyle.value.edge).toEqual({
        style: 'org-chart',
        color: '#000000',
        width: 2,
        arrowSize: 8,
      })
    })

    it('has correct default layout settings', () => {
      const { treeStyle } = getComposable()

      expect(treeStyle.value.layout).toEqual({
        algorithm: 'bounding-box',
        horizontalGap: 10,
        verticalGap: 40,
      })
    })
  })

  describe('resetStyle', () => {
    it('resets node styles to defaults', () => {
      const { treeStyle, resetStyle } = getComposable()

      // Modify node style
      treeStyle.value.node.shape = 'circle'
      treeStyle.value.node.fillColor = '#ff0000'
      treeStyle.value.node.strokeWidth = 5

      resetStyle()

      expect(treeStyle.value.node.shape).toBe('rounded-rectangle')
      expect(treeStyle.value.node.fillColor).toBe('#ffffff')
      expect(treeStyle.value.node.strokeWidth).toBe(2)
    })

    it('resets edge styles to defaults', () => {
      const { treeStyle, resetStyle } = getComposable()

      treeStyle.value.edge.style = 'curve'
      treeStyle.value.edge.width = 6

      resetStyle()

      expect(treeStyle.value.edge.style).toBe('org-chart')
      expect(treeStyle.value.edge.width).toBe(2)
    })

    it('resets layout settings to defaults', () => {
      const { treeStyle, resetStyle } = getComposable()

      treeStyle.value.layout.algorithm = 'tidy'
      treeStyle.value.layout.horizontalGap = 100
      treeStyle.value.layout.verticalGap = 200

      resetStyle()

      expect(treeStyle.value.layout.algorithm).toBe('bounding-box')
      expect(treeStyle.value.layout.horizontalGap).toBe(10)
      expect(treeStyle.value.layout.verticalGap).toBe(40)
    })
  })

  describe('applyExampleStyle', () => {
    it('applies partial node overrides while keeping other defaults', () => {
      const { treeStyle, applyExampleStyle } = getComposable()

      // Modify to non-default values first
      treeStyle.value.node.shape = 'ellipse'
      treeStyle.value.edge.style = 'curve'

      // Apply example with only node shape override
      applyExampleStyle({
        node: { shape: 'circle' },
      })

      // Node shape should be overridden
      expect(treeStyle.value.node.shape).toBe('circle')
      // Other node properties should be default
      expect(treeStyle.value.node.fillColor).toBe('#ffffff')
      expect(treeStyle.value.node.padding).toBe(10)
      // Edge should be reset to default (not kept at 'curve')
      expect(treeStyle.value.edge.style).toBe('org-chart')
    })

    it('applies partial edge overrides', () => {
      const { treeStyle, applyExampleStyle } = getComposable()

      applyExampleStyle({
        edge: { style: 'straight-arrow', width: 4 },
      })

      expect(treeStyle.value.edge.style).toBe('straight-arrow')
      expect(treeStyle.value.edge.width).toBe(4)
      // Other edge properties should be default
      expect(treeStyle.value.edge.color).toBe('#000000')
    })

    it('applies partial layout overrides', () => {
      const { treeStyle, applyExampleStyle } = getComposable()

      applyExampleStyle({
        layout: { algorithm: 'tidy' },
      })

      expect(treeStyle.value.layout.algorithm).toBe('tidy')
      // Other layout properties should be default
      expect(treeStyle.value.layout.horizontalGap).toBe(10)
      expect(treeStyle.value.layout.verticalGap).toBe(40)
    })

    it('applying undefined style resets to defaults', () => {
      const { treeStyle, applyExampleStyle } = getComposable()

      // Modify everything
      treeStyle.value.node.shape = 'ellipse'
      treeStyle.value.edge.style = 'curve'
      treeStyle.value.layout.algorithm = 'tidy'

      applyExampleStyle(undefined)

      expect(treeStyle.value).toEqual(defaultTreeStyle)
    })

    it('starts fresh from defaults (INVARIANT: merge with defaults, not current state)', () => {
      const { treeStyle, applyExampleStyle } = getComposable()

      // Set to non-default
      treeStyle.value.node.fillColor = '#ff0000'

      // Apply example that doesn't mention fillColor
      applyExampleStyle({
        node: { shape: 'circle' },
      })

      // fillColor should be default, NOT the modified '#ff0000'
      expect(treeStyle.value.node.fillColor).toBe('#ffffff')
    })
  })

  describe('exportStyle and importStyle', () => {
    it('exportStyle produces valid JSON', () => {
      const { exportStyle } = getComposable()

      const json = exportStyle()

      expect(() => JSON.parse(json)).not.toThrow()
    })

    it('exportStyle includes style preset wrapper', () => {
      const { exportStyle } = getComposable()

      const parsed = JSON.parse(exportStyle())

      expect(parsed.name).toBe('Exported Style')
      expect(parsed.style).toBeDefined()
      expect(parsed.createdAt).toBeDefined()
    })

    it('round-trip preserves style data', () => {
      const { treeStyle, exportStyle, importStyle, resetStyle } = getComposable()

      // Modify to custom values
      treeStyle.value.node.shape = 'ellipse'
      treeStyle.value.node.padding = 20
      treeStyle.value.edge.style = 'curve'
      treeStyle.value.edge.width = 5
      treeStyle.value.layout.algorithm = 'tidy'
      treeStyle.value.layout.verticalGap = 80

      const exported = exportStyle()

      // Reset to defaults
      resetStyle()

      // Import the exported style
      const success = importStyle(exported)

      expect(success).toBe(true)
      expect(treeStyle.value.node.shape).toBe('ellipse')
      expect(treeStyle.value.node.padding).toBe(20)
      expect(treeStyle.value.edge.style).toBe('curve')
      expect(treeStyle.value.edge.width).toBe(5)
      expect(treeStyle.value.layout.algorithm).toBe('tidy')
      expect(treeStyle.value.layout.verticalGap).toBe(80)
    })

    it('importStyle returns false for invalid JSON', () => {
      const { importStyle } = getComposable()

      expect(importStyle('not valid json')).toBe(false)
      expect(importStyle('{')).toBe(false)
      expect(importStyle('')).toBe(false)
    })

    it('importStyle returns false for missing required sections', () => {
      const { importStyle } = getComposable()

      // Missing style object
      expect(importStyle(JSON.stringify({ name: 'test' }))).toBe(false)

      // Has style but missing sections
      expect(importStyle(JSON.stringify({ style: { node: {} } }))).toBe(false)
      expect(importStyle(JSON.stringify({ style: { node: {}, edge: {} } }))).toBe(false)
    })

    it('importStyle accepts raw TreeStyle object', () => {
      const { importStyle, treeStyle, resetStyle } = getComposable()

      const rawStyle = {
        node: { ...defaultTreeStyle.node, shape: 'circle' as const },
        edge: { ...defaultTreeStyle.edge, style: 'curve' as const },
        layout: { ...defaultTreeStyle.layout, algorithm: 'tidy' as const },
      }

      resetStyle()
      const success = importStyle(JSON.stringify(rawStyle))

      expect(success).toBe(true)
      expect(treeStyle.value.node.shape).toBe('circle')
      expect(treeStyle.value.edge.style).toBe('curve')
      expect(treeStyle.value.layout.algorithm).toBe('tidy')
    })
  })

  describe('direct mutation reactivity', () => {
    it('node property mutations are reactive', () => {
      const { treeStyle } = getComposable()

      treeStyle.value.node.shape = 'ellipse'
      expect(treeStyle.value.node.shape).toBe('ellipse')

      treeStyle.value.node.padding = 25
      expect(treeStyle.value.node.padding).toBe(25)
    })

    it('edge property mutations are reactive', () => {
      const { treeStyle } = getComposable()

      treeStyle.value.edge.width = 4
      expect(treeStyle.value.edge.width).toBe(4)
    })

    it('layout property mutations are reactive', () => {
      const { treeStyle } = getComposable()

      treeStyle.value.layout.horizontalGap = 50
      expect(treeStyle.value.layout.horizontalGap).toBe(50)
    })
  })

  describe('singleton pattern', () => {
    it('multiple calls to useTreeStyle share the same state', () => {
      const composable1 = useTreeStyle()
      const composable2 = useTreeStyle()

      composable1.treeStyle.value.node.shape = 'circle'

      // composable2 should see the same change
      expect(composable2.treeStyle.value.node.shape).toBe('circle')

      // And changes from composable2 should be visible to composable1
      composable2.treeStyle.value.edge.width = 6
      expect(composable1.treeStyle.value.edge.width).toBe(6)
    })
  })

  describe('state isolation from defaults', () => {
    it('modifying treeStyle does not modify defaultTreeStyle', () => {
      const { treeStyle } = getComposable()

      // Store original default values
      const originalNodeShape = defaultTreeStyle.node.shape
      const originalEdgeStyle = defaultTreeStyle.edge.style

      // Modify current style
      treeStyle.value.node.shape = 'ellipse'
      treeStyle.value.edge.style = 'curve'

      // Defaults should be unchanged
      expect(defaultTreeStyle.node.shape).toBe(originalNodeShape)
      expect(defaultTreeStyle.edge.style).toBe(originalEdgeStyle)
    })
  })
})
