# Vue 3 Tutorial for Tree Render

This document explains Vue 3 concepts as they are used in the Tree Render application. It serves as both a reference guide and a tutorial for understanding the codebase.

## Table of Contents

1. [Project Structure](#project-structure)
2. [Vue Single-File Components (SFC)](#vue-single-file-components-sfc)
3. [Composition API](#composition-api)
4. [Reactivity System](#reactivity-system)
5. [Component Communication](#component-communication)
6. [Composables (Shared State)](#composables-shared-state)
7. [Lifecycle Hooks](#lifecycle-hooks)
8. [Vuetify Integration](#vuetify-integration)
9. [TypeScript Integration](#typescript-integration)

---

## Project Structure

```
tree-render/
├── src/
│   ├── main.ts              # Application entry point
│   ├── App.vue              # Root component
│   ├── components/          # Reusable components
│   │   ├── StylePanel.vue   # Side panel with style controls
│   │   └── TreeViewCanvas.vue # Canvas for tree visualization
│   ├── composables/         # Shared reactive state & logic
│   │   └── useTreeStyle.ts  # Tree style state management
│   ├── types/               # TypeScript type definitions
│   │   └── index.ts
│   └── styles/              # Global styles
│       └── main.scss
├── index.html               # HTML entry point
├── vite.config.ts           # Vite configuration
└── package.json
```

---

## Vue Single-File Components (SFC)

Vue uses `.vue` files that combine template, script, and styles in one file.

### Basic Structure

```vue
<script setup lang="ts">
// TypeScript/JavaScript logic goes here
// This section runs when the component is set up
</script>

<template>
  <!-- HTML template goes here -->
  <!-- Vue directives and bindings are used here -->
</template>

<style scoped>
/* CSS styles that only apply to this component */
/* "scoped" prevents styles from leaking to other components */
</style>
```

### In This App

**App.vue** is the root component that:
- Sets up the overall layout (toolbar, side panel, canvas)
- Manages theme switching
- Handles file import/export

**StylePanel.vue** contains:
- Collapsible sections for node, edge, and layout styles
- Button toggles for shape/style selection
- Sliders for numeric values

**TreeViewCanvas.vue** manages:
- The HTML canvas element
- Pan and zoom interactions
- Drawing the tree preview

---

## Composition API

Vue 3's Composition API (used via `<script setup>`) organizes code by logical concern rather than by option type.

### Reactive References (`ref`)

```typescript
import { ref } from 'vue'

// ref() creates a reactive wrapper around a value
const count = ref(0)

// Access or modify the value using .value
count.value++

// In templates, .value is automatically unwrapped
// <template>{{ count }}</template>  <!-- No .value needed -->
```

**Used in TreeViewCanvas.vue:**
```typescript
const canvasRef = ref<HTMLCanvasElement | null>(null)
const zoom = ref(1)
const isPanning = ref(false)
```

### Computed Properties (`computed`)

Computed properties automatically update when their dependencies change.

```typescript
import { ref, computed } from 'vue'

const firstName = ref('John')
const lastName = ref('Doe')

// Automatically recalculates when firstName or lastName changes
const fullName = computed(() => `${firstName.value} ${lastName.value}`)
```

**Used in StylePanel.vue for two-way binding:**
```typescript
const nodeShape = computed({
  get: () => treeStyle.value.node.shape,
  set: (val: NodeShape) => { treeStyle.value.node.shape = val }
})
```

This pattern creates a computed property that can be used with `v-model`.

---

## Reactivity System

Vue's reactivity system tracks dependencies and automatically updates the DOM when data changes.

### How It Works

1. When you access a reactive property during render, Vue records it as a dependency
2. When the property changes, Vue knows which components need to re-render
3. Updates happen automatically and efficiently

### Deep Reactivity with `watch`

```typescript
import { watch } from 'vue'

// Watch a reactive source and run a callback when it changes
watch(
  () => props.styleConfig,  // Source to watch
  () => draw(),             // Callback when it changes
  { deep: true }            // Watch nested properties too
)
```

**Used in TreeViewCanvas.vue** to redraw when any style property changes.

---

## Component Communication

### Props (Parent → Child)

Props pass data from parent to child components.

**Defining props with TypeScript:**
```typescript
// In child component (TreeViewCanvas.vue)
const props = defineProps<{
  styleConfig: TreeStyle
}>()

// Access as props.styleConfig
```

**Passing props from parent:**
```vue
<!-- In App.vue -->
<TreeViewCanvas :style-config="treeStyle" />
```

The `:` prefix (shorthand for `v-bind:`) indicates the value is a JavaScript expression.

### Events (Child → Parent)

Events let children communicate back to parents.

```typescript
// In child component
const emit = defineEmits<{
  'update:modelValue': [value: string]
  'change': [newValue: string, oldValue: string]
}>()

// Emit an event
emit('change', newVal, oldVal)
```

```vue
<!-- In parent -->
<ChildComponent @change="handleChange" />
```

### v-model (Two-way Binding)

`v-model` is syntactic sugar for prop + event:

```vue
<!-- These are equivalent: -->
<input v-model="text" />
<input :value="text" @input="text = $event.target.value" />
```

**Used with Vuetify components:**
```vue
<v-btn-toggle v-model="nodeShape" mandatory>
  <!-- buttons -->
</v-btn-toggle>
```

---

## Composables (Shared State)

Composables are functions that encapsulate and reuse stateful logic. This pattern is similar to React hooks.

### Creating a Composable

```typescript
// src/composables/useTreeStyle.ts

import { ref } from 'vue'
import type { TreeStyle } from '@/types'

// State defined outside the function is shared across all components
const treeStyle = ref<TreeStyle>(...)

export function useTreeStyle() {
  function resetStyle() {
    treeStyle.value = structuredClone(defaultTreeStyle)
  }

  function exportStyle(): string {
    return JSON.stringify(treeStyle.value, null, 2)
  }

  // Return reactive state and methods
  return {
    treeStyle,
    resetStyle,
    exportStyle
  }
}
```

### Using a Composable

```typescript
// In any component
import { useTreeStyle } from '@/composables/useTreeStyle'

const { treeStyle, resetStyle } = useTreeStyle()

// treeStyle is reactive and shared across all components that use this composable
```

**Why this pattern?**
- State is shared across components without prop drilling
- Logic is organized by feature, not by component
- Easy to test and reuse
- Similar to a lightweight state management solution

---

## Lifecycle Hooks

Vue components have lifecycle hooks that let you run code at specific times.

### Common Hooks

```typescript
import { onMounted, onUnmounted, onUpdated } from 'vue'

// Called after the component is mounted to the DOM
onMounted(() => {
  console.log('Component is now in the DOM')
  window.addEventListener('resize', handleResize)
})

// Called before the component is unmounted
onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

// Called after every reactive update
onUpdated(() => {
  console.log('Component re-rendered')
})
```

**Used in TreeViewCanvas.vue:**
```typescript
onMounted(() => {
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeCanvas)
})
```

---

## Vuetify Integration

Vuetify is a Material Design component library for Vue.

### Setup (main.ts)

```typescript
import { createApp } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import 'vuetify/styles'

const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'light',
    themes: {
      light: { colors: { ... } },
      dark: { colors: { ... } }
    }
  }
})

const app = createApp(App)
app.use(vuetify)
app.mount('#app')
```

### Using Theme Colors

Access theme colors in styles:
```css
background: rgb(var(--v-theme-surface));
color: rgb(var(--v-theme-primary));
```

### Switching Themes Programmatically

```typescript
import { useTheme } from 'vuetify'

const theme = useTheme()

// Change theme
theme.global.name.value = 'dark'
```

### Common Components Used

- `v-app` - Root wrapper (required)
- `v-toolbar` - App bar
- `v-btn` - Buttons
- `v-btn-toggle` - Button group with selection
- `v-expansion-panels` - Collapsible sections
- `v-slider` - Range input
- `v-sheet` - Container with theme support
- `v-icon` - Material Design icons

---

## TypeScript Integration

### Type Definitions

```typescript
// src/types/index.ts

// Union types for constrained values
export type NodeShape = 'rectangle' | 'rounded-rectangle' | 'circle' | 'ellipse'

// Interface for complex objects
export interface TreeStyle {
  node: {
    shape: NodeShape
    fillColor: string
    // ...
  }
  edge: {
    style: EdgeStyle
    // ...
  }
}
```

### Typing Props

```typescript
// Using defineProps with TypeScript generics
const props = defineProps<{
  styleConfig: TreeStyle
  optional?: string  // Optional prop
}>()
```

### Typing Refs

```typescript
// Type the ref value
const canvasRef = ref<HTMLCanvasElement | null>(null)
const count = ref<number>(0)
```

### Typing Composable Returns

```typescript
export function useTreeStyle() {
  // TypeScript infers return type automatically
  // Or you can be explicit:
  return {
    treeStyle,      // Ref<TreeStyle>
    resetStyle,     // () => void
    exportStyle     // () => string
  }
}
```

---

## Quick Reference

| Concept | Vue 3 Syntax |
|---------|--------------|
| Reactive value | `const x = ref(0)` |
| Reactive object | `const x = reactive({})` |
| Computed | `const x = computed(() => ...)` |
| Watch | `watch(source, callback)` |
| Props | `defineProps<{ name: Type }>()` |
| Events | `defineEmits<{ name: [...] }>()` |
| Mounted | `onMounted(() => ...)` |
| Template ref | `<div ref="myRef">` + `const myRef = ref(null)` |

---

## Further Reading

- [Vue 3 Documentation](https://vuejs.org/guide/introduction.html)
- [Vue 3 Composition API](https://vuejs.org/api/composition-api-setup.html)
- [Vuetify 3 Documentation](https://vuetifyjs.com/)
- [Vite Documentation](https://vitejs.dev/)
