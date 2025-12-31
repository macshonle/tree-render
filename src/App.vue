<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useTheme } from 'vuetify'
import {
  mdiWeatherSunny,
  mdiWeatherNight,
  mdiThemeLightDark,
  mdiImport,
  mdiExport,
} from '@mdi/js'
import StylePanel from './components/StylePanel.vue'
import TreeViewCanvas from './components/TreeViewCanvas.vue'
import { createTreeStyleStore, provideTreeStyle } from './composables/useTreeStyle'
import { createDebugModeStore, provideDebugMode } from './composables/useDebugMode'
import { createCanvasViewStore, provideCanvasView } from './composables/useCanvasView'
import { useTreeExamples } from './composables/useTreeExamples'

const theme = useTheme()

const treeStyleStore = createTreeStyleStore()
provideTreeStyle(treeStyleStore)
const { treeStyle, downloadStyle, loadStyleFromFile, applyExampleStyle } = treeStyleStore

provideDebugMode(createDebugModeStore())
provideCanvasView(createCanvasViewStore())

const { examples, findExampleById } = useTreeExamples()
const selectedExampleId = ref(examples.value[0]?.id ?? '')
const selectedExample = computed(() =>
  selectedExampleId.value ? findExampleById(selectedExampleId.value) : null
)

const fileInput = ref<HTMLInputElement | null>(null)

// Theme mode: 'system' | 'light' | 'dark'
const themeMode = ref<'system' | 'light' | 'dark'>('system')

// Icon for current theme mode
const themeIcon = computed(() => {
  switch (themeMode.value) {
    case 'light': return mdiWeatherSunny
    case 'dark': return mdiWeatherNight
    default: return mdiThemeLightDark
  }
})

// Apply theme based on mode
function applyTheme() {
  if (themeMode.value === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    theme.global.name.value = isDark ? 'dark' : 'light'
  } else {
    theme.global.name.value = themeMode.value
  }
}

// Cycle through theme modes
function cycleTheme() {
  const modes: Array<'system' | 'light' | 'dark'> = ['system', 'light', 'dark']
  const currentIndex = modes.indexOf(themeMode.value)
  themeMode.value = modes[(currentIndex + 1) % modes.length]
  applyTheme()
}

// Handle system theme changes
function handleSystemThemeChange() {
  if (themeMode.value === 'system') {
    applyTheme()
  }
}

watch(selectedExample, (example) => {
  applyExampleStyle(example?.style)
}, { immediate: true })

onMounted(() => {
  applyTheme()
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', handleSystemThemeChange)
})

onUnmounted(() => {
  window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', handleSystemThemeChange)
})

function handleImport() {
  fileInput.value?.click()
}

function selectExample(id: string | null) {
  if (!id) return
  if (findExampleById(id)) {
    selectedExampleId.value = id
  }
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
      <v-toolbar
        density="compact"
        class="toolbar-panel"
      >
        <v-toolbar-title class="text-body-2">
          Tree Render
        </v-toolbar-title>
        <span class="text-body-2 text-medium-emphasis ml-4 mr-2">Example</span>
        <v-select
          :items="examples"
          :model-value="selectedExample?.id"
          item-title="name"
          item-value="id"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 200px"
          @update:model-value="selectExample($event)"
        />
        <v-spacer />
        <!-- Theme toggle -->
        <v-btn
          variant="text"
          size="small"
          class="mr-2 theme-toggle"
          @click="cycleTheme"
        >
          <v-icon start>
            {{ themeIcon }}
          </v-icon>
          {{ themeMode === 'system' ? 'System' : themeMode === 'light' ? 'Light' : 'Dark' }}
          <v-tooltip
            activator="parent"
            location="bottom"
          >
            Click to cycle: System → Light → Dark
          </v-tooltip>
        </v-btn>
        <v-divider
          vertical
          class="mr-2"
        />
        <v-btn
          variant="outlined"
          size="small"
          class="mr-2"
          @click="handleImport"
        >
          <v-icon
            start
            :icon="mdiImport"
          />
          Import Style
        </v-btn>
        <v-btn
          variant="outlined"
          size="small"
          class="mr-4"
          @click="downloadStyle()"
        >
          <v-icon
            start
            :icon="mdiExport"
          />
          Export Style
        </v-btn>
        <input
          ref="fileInput"
          type="file"
          accept=".json"
          style="display: none"
          @change="handleFileSelect"
        >
      </v-toolbar>

      <!-- Main Content Area -->
      <div class="main-content">
        <!-- Left Side Panel - Style Controls -->
        <v-sheet
          class="side-panel"
          color="surface"
        >
          <StylePanel />
        </v-sheet>

        <!-- Canvas Area -->
        <div class="canvas-container">
          <TreeViewCanvas
            :style-config="treeStyle"
            :tree-data="selectedExample"
          />
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

.theme-toggle {
  width: 128px;
  justify-content: center;
}
</style>
