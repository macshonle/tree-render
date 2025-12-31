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
  mdiBug,
} from '@mdi/js'
import { useTreeStyle } from '@/composables/useTreeStyle'
import { useDebugMode } from '@/composables/useDebugMode'
import { useCanvasView } from '@/composables/useCanvasView'
import type { NodeShape, EdgeStyle, LayoutAlgorithmType } from '@/types'

const { treeStyle, resetStyle } = useTreeStyle()
const { debugMode, setDebugMode } = useDebugMode()
const { resetView } = useCanvasView()

const debugEnabled = computed({
  get: () => debugMode.value,
  set: (val: boolean) => setDebugMode(val)
})

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

// Layout algorithm options
const layoutAlgorithmOptions: { value: LayoutAlgorithmType; label: string }[] = [
  { value: 'bounding-box', label: 'Bounding Box' },
  { value: 'tidy', label: 'Tidy' }
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

const layoutAlgorithm = computed({
  get: () => treeStyle.value.layout.algorithm,
  set: (val: LayoutAlgorithmType) => { treeStyle.value.layout.algorithm = val }
})

const horizontalGap = computed({
  get: () => treeStyle.value.layout.horizontalGap,
  set: (val: number) => { treeStyle.value.layout.horizontalGap = val }
})

const verticalGap = computed({
  get: () => treeStyle.value.layout.verticalGap,
  set: (val: number) => { treeStyle.value.layout.verticalGap = val }
})

const reduceLeafSiblingGaps = computed({
  get: () => treeStyle.value.layout.reduceLeafSiblingGaps,
  set: (val: boolean) => { treeStyle.value.layout.reduceLeafSiblingGaps = val }
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
  <div class="panel-sections">
    <!-- Node Styles Section -->
    <div class="panel-section">
      <div class="section-title">
        <v-icon
          size="x-small"
          class="mr-2"
          :icon="mdiShapeOutline"
        />
        Node Style
      </div>
      <div class="section-body">
        <div class="text-caption">
          Shape
        </div>
        <v-btn-toggle
          v-model="nodeShape"
          mandatory
          density="compact"
          class="mb-2"
        >
          <v-btn
            v-for="shape in nodeShapeOptions"
            :key="shape.value"
            :value="shape.value"
            size="small"
          >
            <v-icon :icon="shape.icon" />
            <v-tooltip
              activator="parent"
              location="bottom"
            >
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
          class="mb-2"
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
    </div>

    <v-divider class="section-divider" />

    <!-- Edge Styles Section -->
    <div class="panel-section">
      <div class="section-title">
        <v-icon
          size="x-small"
          class="mr-2"
          :icon="mdiVectorLine"
        />
        Edge Style
      </div>
      <div class="section-body">
        <div class="text-caption">
          Connector Type
        </div>
        <v-btn-toggle
          v-model="edgeStyle"
          mandatory
          density="compact"
          class="mb-2"
        >
          <v-btn
            v-for="style in edgeStyleOptions"
            :key="style.value"
            :value="style.value"
            size="small"
          >
            <v-icon :icon="style.icon" />
            <v-tooltip
              activator="parent"
              location="bottom"
            >
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
    </div>

    <v-divider class="section-divider" />

    <!-- Layout Section -->
    <div class="panel-section">
      <div class="section-title">
        <v-icon
          size="x-small"
          class="mr-2"
          :icon="mdiArrowExpandAll"
        />
        Layout
      </div>
      <div class="section-body">
        <div class="text-caption">
          Algorithm
        </div>
        <div class="algorithm-grid mb-2">
          <v-btn
            v-for="algo in layoutAlgorithmOptions"
            :key="algo.value"
            :variant="layoutAlgorithm === algo.value ? 'flat' : 'outlined'"
            :color="layoutAlgorithm === algo.value ? 'primary' : undefined"
            size="small"
            @click="layoutAlgorithm = algo.value"
          >
            {{ algo.label }}
          </v-btn>
        </div>

        <v-slider
          v-model="horizontalGap"
          label="Min Gap"
          :min="5"
          :max="100"
          :step="5"
          thumb-label
          density="compact"
          hide-details
          class="mb-2"
        >
          <template #append>
            <span class="text-caption">{{ horizontalGap }}px</span>
          </template>
        </v-slider>

        <v-slider
          v-model="verticalGap"
          label="Line Spacing"
          :min="5"
          :max="150"
          :step="5"
          thumb-label
          density="compact"
          hide-details
        >
          <template #append>
            <span class="text-caption">{{ verticalGap }}px</span>
          </template>
        </v-slider>

        <v-checkbox
          v-model="reduceLeafSiblingGaps"
          label="Reduce Leaf Sibling Gaps"
          density="compact"
          hide-details
          class="mt-1"
        />
      </div>
    </div>
  </div>

  <!-- Debug Mode -->
  <div class="pa-2 debug-section">
    <v-checkbox
      v-model="debugEnabled"
      density="compact"
      hide-details
      class="debug-checkbox"
    >
      <template #label>
        <div class="d-flex align-center">
          <v-icon
            size="small"
            class="mr-2"
            :icon="mdiBug"
          />
          <span class="text-caption">Debug Contours</span>
        </div>
      </template>
    </v-checkbox>
    <div
      v-if="debugEnabled"
      class="mt-1 ml-6"
    >
      <div class="text-caption text-medium-emphasis mb-1">
        Click nodes or edges to see contours
      </div>
    </div>
  </div>

  <!-- Reset Button -->
  <div class="pa-2 pt-0">
    <v-btn
      variant="outlined"
      size="small"
      block
      @click="resetStyle(); resetView()"
    >
      <v-icon
        start
        :icon="mdiRefresh"
      />
      Reset to Defaults
    </v-btn>
  </div>
</template>

<style scoped>
.panel-sections {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-title {
  display: flex;
  align-items: center;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.section-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-divider {
  opacity: 0.6;
}

.debug-section {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.debug-checkbox :deep(.v-label) {
  opacity: 1;
}

.contour-step-input {
  max-width: 140px;
}

.contour-step-input :deep(.v-field__input) {
  min-height: 32px;
  padding-top: 4px;
  padding-bottom: 4px;
}

.algorithm-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}

.algorithm-grid .v-btn {
  min-width: 0;
}
</style>
