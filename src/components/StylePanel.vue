<script setup lang="ts">
import { computed } from 'vue'
import {
  mdiSquareOutline,
  mdiSquareRoundedOutline,
  mdiCircleOutline,
  mdiEllipseOutline,
  mdiVectorCurve,
  mdiArrowRight,
  mdiSitemapOutline,
  mdiShapeOutline,
  mdiVectorLine,
  mdiArrowExpandAll,
  mdiRefresh,
} from '@mdi/js'
import { useTreeStyle } from '@/composables/useTreeStyle'
import type { NodeShape, EdgeStyle } from '@/types'

const { treeStyle, resetStyle } = useTreeStyle()

// Node shape options
const nodeShapeOptions: { value: NodeShape; label: string; icon: string }[] = [
  { value: 'rectangle', label: 'Rectangle', icon: mdiSquareOutline },
  { value: 'rounded-rectangle', label: 'Rounded', icon: mdiSquareRoundedOutline },
  { value: 'circle', label: 'Circle', icon: mdiCircleOutline },
  { value: 'ellipse', label: 'Ellipse', icon: mdiEllipseOutline }
]

// Edge style options
const edgeStyleOptions: { value: EdgeStyle; label: string; icon: string }[] = [
  { value: 'curve', label: 'Curve', icon: mdiVectorCurve },
  { value: 'straight-arrow', label: 'Straight', icon: mdiArrowRight },
  { value: 'org-chart', label: 'Org Chart', icon: mdiSitemapOutline }
]

// Computed bindings for v-model
const nodeShape = computed({
  get: () => treeStyle.value.node.shape,
  set: (val: NodeShape) => { treeStyle.value.node.shape = val }
})

const edgeStyle = computed({
  get: () => treeStyle.value.edge.style,
  set: (val: EdgeStyle) => { treeStyle.value.edge.style = val }
})

const horizontalGap = computed({
  get: () => treeStyle.value.layout.horizontalGap,
  set: (val: number) => { treeStyle.value.layout.horizontalGap = val }
})

const verticalGap = computed({
  get: () => treeStyle.value.layout.verticalGap,
  set: (val: number) => { treeStyle.value.layout.verticalGap = val }
})

const lineSpacing = computed({
  get: () => treeStyle.value.layout.lineSpacing,
  set: (val: number) => { treeStyle.value.layout.lineSpacing = val }
})

const edgeWidth = computed({
  get: () => treeStyle.value.edge.width,
  set: (val: number) => { treeStyle.value.edge.width = val }
})

const nodeStrokeWidth = computed({
  get: () => treeStyle.value.node.strokeWidth,
  set: (val: number) => { treeStyle.value.node.strokeWidth = val }
})

const nodePadding = computed({
  get: () => treeStyle.value.node.padding,
  set: (val: number) => { treeStyle.value.node.padding = val }
})
</script>

<template>
  <v-expansion-panels variant="accordion" multiple :model-value="[0, 1, 2]">
    <!-- Node Styles Section -->
    <v-expansion-panel class="style-section">
      <v-expansion-panel-title>
        <v-icon size="small" class="mr-2" :icon="mdiShapeOutline" />
        Node Style
      </v-expansion-panel-title>
      <v-expansion-panel-text>
        <div class="pa-2">
          <div class="text-caption mb-2">Shape</div>
          <v-btn-toggle
            v-model="nodeShape"
            mandatory
            density="compact"
            class="mb-3"
          >
            <v-btn
              v-for="shape in nodeShapeOptions"
              :key="shape.value"
              :value="shape.value"
              size="small"
            >
              <v-icon :icon="shape.icon" />
              <v-tooltip activator="parent" location="bottom">
                {{ shape.label }}
              </v-tooltip>
            </v-btn>
          </v-btn-toggle>

          <v-slider
            v-model="nodeStrokeWidth"
            label="Border"
            :min="0"
            :max="8"
            :step="1"
            thumb-label
            density="compact"
            hide-details
            class="mb-3"
          />

          <v-slider
            v-model="nodePadding"
            label="Padding"
            :min="4"
            :max="32"
            :step="2"
            thumb-label
            density="compact"
            hide-details
          />
        </div>
      </v-expansion-panel-text>
    </v-expansion-panel>

    <!-- Edge Styles Section -->
    <v-expansion-panel class="style-section">
      <v-expansion-panel-title>
        <v-icon size="small" class="mr-2" :icon="mdiVectorLine" />
        Edge Style
      </v-expansion-panel-title>
      <v-expansion-panel-text>
        <div class="pa-2">
          <div class="text-caption mb-2">Connector Type</div>
          <v-btn-toggle
            v-model="edgeStyle"
            mandatory
            density="compact"
            class="mb-3"
          >
            <v-btn
              v-for="style in edgeStyleOptions"
              :key="style.value"
              :value="style.value"
              size="small"
            >
              <v-icon :icon="style.icon" />
              <v-tooltip activator="parent" location="bottom">
                {{ style.label }}
              </v-tooltip>
            </v-btn>
          </v-btn-toggle>

          <v-slider
            v-model="edgeWidth"
            label="Line Width"
            :min="1"
            :max="6"
            :step="1"
            thumb-label
            density="compact"
            hide-details
          />
        </div>
      </v-expansion-panel-text>
    </v-expansion-panel>

    <!-- Layout Section -->
    <v-expansion-panel class="style-section">
      <v-expansion-panel-title>
        <v-icon size="small" class="mr-2" :icon="mdiArrowExpandAll" />
        Layout Spacing
      </v-expansion-panel-title>
      <v-expansion-panel-text>
        <div class="pa-2">
          <v-slider
            v-model="horizontalGap"
            label="H Gap"
            :min="10"
            :max="100"
            :step="5"
            thumb-label
            density="compact"
            hide-details
            class="mb-3"
          >
            <template #append>
              <span class="text-caption">{{ horizontalGap }}px</span>
            </template>
          </v-slider>

          <v-slider
            v-model="verticalGap"
            label="V Gap"
            :min="20"
            :max="150"
            :step="5"
            thumb-label
            density="compact"
            hide-details
            class="mb-3"
          >
            <template #append>
              <span class="text-caption">{{ verticalGap }}px</span>
            </template>
          </v-slider>

          <v-slider
            v-model="lineSpacing"
            label="Line Spacing"
            :min="5"
            :max="50"
            :step="5"
            thumb-label
            density="compact"
            hide-details
          >
            <template #append>
              <span class="text-caption">{{ lineSpacing }}px</span>
            </template>
          </v-slider>
        </div>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>

  <!-- Reset Button -->
  <div class="pa-3">
    <v-btn
      variant="outlined"
      size="small"
      block
      @click="resetStyle"
    >
      <v-icon start :icon="mdiRefresh" />
      Reset to Defaults
    </v-btn>
  </div>
</template>

<style scoped>
.style-section {
  background: rgb(var(--v-theme-surface)) !important;
}

.style-section :deep(.v-expansion-panel-title) {
  min-height: 44px;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.style-section :deep(.v-expansion-panel-text__wrapper) {
  padding: 0;
}
</style>
