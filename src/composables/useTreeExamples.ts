import { ref, computed } from 'vue'
import { treeExamples } from '@/data/treeExamples'
import { useTreeStyle } from './useTreeStyle'

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
