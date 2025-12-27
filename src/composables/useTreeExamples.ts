import { ref, computed } from 'vue'
import type { TreeExample } from '@/types'
import { useTreeStyle } from './useTreeStyle'

// Import all .tree.yaml files at build time using Vite's glob import
// The custom vite-plugin-tree-examples transforms these into TreeExample objects
// Note: import.meta.glob requires a relative path (not the @ alias)
const exampleModules = import.meta.glob<TreeExample>(
  '../data/examples/*.tree.yaml',
  { eager: true, import: 'default' }
)

// Convert the module record to a sorted array
const treeExamples: TreeExample[] = Object.values(exampleModules).sort((a, b) =>
  a.name.localeCompare(b.name)
)

// Module-level state (shared across components)
const selectedExampleId = ref<string>(treeExamples[0]?.id ?? '')

// Apply initial example's style
const { applyExampleStyle } = useTreeStyle()
if (treeExamples[0]?.style) {
  applyExampleStyle(treeExamples[0].style)
}

export function useTreeExamples() {
  const { applyExampleStyle } = useTreeStyle()

  // All available examples
  const examples = computed(() => treeExamples)

  // Currently selected example
  const selectedExample = computed(() =>
    treeExamples.find((e) => e.id === selectedExampleId.value) ?? null
  )

  // Select an example by ID and apply its style
  function selectExample(id: string) {
    const example = treeExamples.find((e) => e.id === id)
    if (example) {
      selectedExampleId.value = id
      applyExampleStyle(example.style)
    }
  }

  return {
    examples,
    selectedExample,
    selectExample,
  }
}
