import { computed } from 'vue'
import type { TreeExample } from '@/types'

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

export function useTreeExamples() {
  // All available examples
  const examples = computed(() => treeExamples)

  function findExampleById(id: string): TreeExample | null {
    return treeExamples.find((example) => example.id === id) ?? null
  }

  return {
    examples,
    findExampleById,
  }
}
