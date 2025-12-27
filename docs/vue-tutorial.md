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
9. [Bundle Optimization](#bundle-optimization)
10. [Vite Plugins and Build-Time Transforms](#vite-plugins-and-build-time-transforms)
11. [TypeScript Integration](#typescript-integration)

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
│   │   ├── useTreeStyle.ts  # Tree style state management
│   │   └── useTreeExamples.ts # Tree example loading
│   ├── data/
│   │   └── examples/        # Tree example definitions (.tree.yaml)
│   ├── types/               # TypeScript type definitions
│   │   └── index.ts
│   └── styles/              # Global styles
│       └── main.scss
├── vite-plugin-tree-examples.ts  # Custom Vite plugin for YAML transform
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
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import 'vuetify/styles'

const vuetify = createVuetify({
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: { mdi },
  },
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

Note: We use `vuetify/iconsets/mdi-svg` instead of `@mdi/font` for tree-shakeable SVG icons. See [Bundle Optimization](#bundle-optimization) for details.

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

## Bundle Optimization

Optimizing bundle size is crucial for fast page loads. This project demonstrates several best practices.

### Tree-Shakeable Icons with @mdi/js

**Problem**: The `@mdi/font` package loads all 7,000+ Material Design Icons as a web font (~1.3 MB), even if you only use a few icons.

**Solution**: Use `@mdi/js` which exports each icon as a tree-shakeable SVG path string. Only the icons you import are included in the bundle.

```typescript
// ❌ Bad: Loads entire icon font
import '@mdi/font/css/materialdesignicons.css'

// ✅ Good: Only imports specific icons (~200 bytes each)
import { mdiWeatherSunny, mdiImport, mdiExport } from '@mdi/js'
```

**Using icons in templates:**

```vue
<script setup lang="ts">
import { mdiWeatherSunny } from '@mdi/js'
</script>

<template>
  <!-- Use :icon prop with the imported constant -->
  <v-icon :icon="mdiWeatherSunny" />
</template>
```

**Configuring Vuetify for SVG icons:**

```typescript
// main.ts
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'

const vuetify = createVuetify({
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: { mdi },
  },
})
```

### Component Auto-Import with vite-plugin-vuetify

**Problem**: Importing all Vuetify components increases bundle size:

```typescript
// ❌ Imports ALL components
import * as components from 'vuetify/components'
```

**Solution**: Use `vite-plugin-vuetify` for automatic, tree-shakeable imports:

```typescript
// vite.config.ts
import vuetify from 'vite-plugin-vuetify'

export default defineConfig({
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
  ],
})
```

With auto-import enabled, you can use Vuetify components in templates without explicit imports. The plugin analyzes your templates and only bundles the components you actually use.

### Results

These optimizations reduced the bundle size significantly:

| Metric | Before | After | Savings |
|--------|--------|-------|---------|
| CSS | 848 kB | 376 kB | 56% |
| JS | 632 kB | 326 kB | 48% |
| Icon fonts | 3.6 MB | 0 | 100% |

---

## Vite Plugins and Build-Time Transforms

Vite's plugin system enables powerful build-time transformations. This project uses a custom plugin to transform YAML tree definitions into JavaScript modules.

### How Vite Plugins Work

Vite plugins can intercept files at various stages of the build process:

```
User imports a file (e.g., '*.tree.yaml')
        ↓
Plugin's resolveId() — Redirect imports, create virtual modules
        ↓
Plugin's load() — Generate content for the file
        ↓
Plugin's transform() — Modify/compile the content
        ↓
Vite bundles the transformed module
```

### Glob Imports with import.meta.glob

Vite provides `import.meta.glob` for importing multiple files at build time:

```typescript
// Import all .tree.yaml files eagerly (bundled at build time)
// Note: import.meta.glob requires relative paths, not the @ alias
const modules = import.meta.glob<TreeExample>(
  '../data/examples/*.tree.yaml',
  { eager: true, import: 'default' }
)

// Result: { '../data/examples/foo.tree.yaml': TreeExample, ... }
const examples = Object.values(modules)
```

Options:
- `eager: true` — Load all modules immediately (no lazy loading)
- `import: 'default'` — Import the default export directly
- Without `eager`, modules are loaded lazily as `() => Promise<Module>`

**Important**: The glob pattern must be a relative path. Path aliases like `@/` don't work with `import.meta.glob` because the pattern is analyzed statically at build time before alias resolution.

### Custom Plugin: Tree Examples

This project includes `vite-plugin-tree-examples.ts` which transforms `.tree.yaml` files into `TreeExample` modules.

**YAML format (fluent DSL):**

```yaml
# src/data/examples/binary-tree.tree.yaml
id: binary-tree
name: Binary Tree
sizingMode: fixed
nodeWidth: 40
nodeHeight: 40
style:
  node: { shape: circle }
  edge: { style: straight-arrow }

tree:
  - node: 1
    children:
      - node: 2
        children:
          - node: 4
          - node: 5
      - node: 3
        children:
          - node: 6
          - node: 7
```

**Plugin implementation (simplified):**

```typescript
// vite-plugin-tree-examples.ts
import type { Plugin } from 'vite'
import YAML from 'yaml'

export default function treeExamplesPlugin(): Plugin {
  return {
    name: 'vite-plugin-tree-examples',

    transform(code: string, id: string) {
      // Only process .tree.yaml files
      if (!id.endsWith('.tree.yaml')) return null

      // Parse YAML and transform the tree DSL
      const parsed = YAML.parse(code)
      const treeExample = transformToTreeExample(parsed)

      // Return as ES module
      return {
        code: `export default ${JSON.stringify(treeExample)}`,
        map: null,
      }
    },
  }
}
```

**Registering the plugin:**

```typescript
// vite.config.ts
import treeExamples from './vite-plugin-tree-examples'

export default defineConfig({
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
    treeExamples(),  // Custom plugin
  ],
})
```

### TypeScript Support for Custom File Types

Add type declarations for custom imports:

```typescript
// src/vite-env.d.ts
declare module '*.tree.yaml' {
  import type { TreeExample } from '@/types'
  const example: TreeExample
  export default example
}
```

### Benefits of Build-Time Transforms

1. **Authoring experience** — Write in YAML with comments, simpler syntax
2. **Runtime performance** — No parsing overhead; data is pre-compiled to JS
3. **Type safety** — Plugin validates structure; TypeScript knows the types
4. **Bundle optimization** — Only include what's used; tree-shake unused examples

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
