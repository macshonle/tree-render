import { ref } from 'vue'
import { type TreeStyle, type StylePreset, type DeepPartial, defaultTreeStyle } from '@/types'

// Reactive tree style state
const treeStyle = ref<TreeStyle>(structuredClone(defaultTreeStyle))

export function useTreeStyle() {
  // Reset to default style
  function resetStyle() {
    treeStyle.value = structuredClone(defaultTreeStyle)
  }

  // Apply example-specific style overrides (merged with defaults)
  function applyExampleStyle(styleOverrides?: DeepPartial<TreeStyle>) {
    // Start with a fresh copy of defaults
    const newStyle = structuredClone(defaultTreeStyle)

    // Merge in the example-specific overrides
    if (styleOverrides) {
      if (styleOverrides.node) {
        Object.assign(newStyle.node, styleOverrides.node)
      }
      if (styleOverrides.edge) {
        Object.assign(newStyle.edge, styleOverrides.edge)
      }
      if (styleOverrides.layout) {
        Object.assign(newStyle.layout, styleOverrides.layout)
      }
    }

    treeStyle.value = newStyle
  }

  // Export current style as JSON
  function exportStyle(): string {
    const preset: StylePreset = {
      name: 'Exported Style',
      style: treeStyle.value,
      createdAt: new Date().toISOString()
    }
    return JSON.stringify(preset, null, 2)
  }

  // Import style from JSON string
  function importStyle(jsonString: string): boolean {
    try {
      const parsed = JSON.parse(jsonString)
      // Validate it has the expected structure
      if (parsed.style && parsed.style.node && parsed.style.edge && parsed.style.layout) {
        treeStyle.value = parsed.style
        return true
      }
      // Also accept raw TreeStyle object
      if (parsed.node && parsed.edge && parsed.layout) {
        treeStyle.value = parsed
        return true
      }
      return false
    } catch {
      return false
    }
  }

  // Download style as file
  function downloadStyle(filename = 'tree-style.json') {
    const json = exportStyle()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // Load style from file
  async function loadStyleFromFile(file: File): Promise<boolean> {
    const text = await file.text()
    return importStyle(text)
  }

  return {
    treeStyle,
    resetStyle,
    applyExampleStyle,
    exportStyle,
    importStyle,
    downloadStyle,
    loadStyleFromFile
  }
}
