import { ref, computed } from 'vue'
import { treeExamples } from '@/data/treeExamples'

// Module-level state (shared across components)
const selectedExampleId = ref<string>(treeExamples[0]?.id ?? '')

export function useTreeExamples() {
  // All available examples
  const examples = computed(() => treeExamples)

  // Currently selected example
  const selectedExample = computed(() =>
    treeExamples.find((e) => e.id === selectedExampleId.value) ?? null
  )

  // Select an example by ID
  function selectExample(id: string) {
    if (treeExamples.some((e) => e.id === id)) {
      selectedExampleId.value = id
    }
  }

  return {
    examples,
    selectedExample,
    selectExample,
  }
}
