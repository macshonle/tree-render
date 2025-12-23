<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useTheme } from 'vuetify'
import StylePanel from './components/StylePanel.vue'
import TreeViewCanvas from './components/TreeViewCanvas.vue'
import { useTreeStyle } from './composables/useTreeStyle'
import { useTreeExamples } from './composables/useTreeExamples'

const theme = useTheme()
const { treeStyle, downloadStyle, loadStyleFromFile } = useTreeStyle()
const { examples, selectedExample, selectExample } = useTreeExamples()

const fileInput = ref<HTMLInputElement | null>(null)

// System theme detection
function updateTheme() {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  theme.change(isDark ? 'dark' : 'light')
}

onMounted(() => {
  updateTheme()
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateTheme)
})

onUnmounted(() => {
  window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', updateTheme)
})

function handleImport() {
  fileInput.value?.click()
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    const success = await loadStyleFromFile(file)
    if (!success) {
      alert('Invalid style file format')
    }
    input.value = ''
  }
}
</script>

<template>
  <v-app>
    <div class="app-container">
      <!-- Top Toolbar -->
      <v-toolbar density="compact" class="toolbar-panel">
        <v-toolbar-title class="text-body-2">Tree Render</v-toolbar-title>
        <span class="text-body-2 text-medium-emphasis ml-4 mr-2">Example</span>
        <v-select
          :items="examples"
          :model-value="selectedExample?.id"
          @update:model-value="selectExample($event)"
          item-title="name"
          item-value="id"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 200px"
        />
        <v-spacer />
        <v-btn
          variant="outlined"
          size="small"
          class="mr-2"
          @click="handleImport"
        >
          <v-icon start>mdi-import</v-icon>
          Import Style
        </v-btn>
        <v-btn
          variant="outlined"
          size="small"
          class="mr-4"
          @click="downloadStyle()"
        >
          <v-icon start>mdi-export</v-icon>
          Export Style
        </v-btn>
        <input
          ref="fileInput"
          type="file"
          accept=".json"
          style="display: none"
          @change="handleFileSelect"
        />
      </v-toolbar>

      <!-- Main Content Area -->
      <div class="main-content">
        <!-- Left Side Panel - Style Controls -->
        <v-sheet class="side-panel" color="surface">
          <StylePanel />
        </v-sheet>

        <!-- Canvas Area -->
        <div class="canvas-container">
          <TreeViewCanvas :style-config="treeStyle" :tree-data="selectedExample" />
        </div>
      </div>
    </div>
  </v-app>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.side-panel {
  width: 280px;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid rgba(128, 128, 128, 0.3);
}

.canvas-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: rgb(var(--v-theme-background));
}
</style>
