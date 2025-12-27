import { createApp } from 'vue'
import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import 'vuetify/styles'
import '@fontsource-variable/ibm-plex-sans'
import App from './App.vue'
import './styles/main.scss'

const vuetify = createVuetify({
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: { mdi },
  },
  theme: {
    defaultTheme: 'system',
    themes: {
      light: {
        dark: false,
        colors: {
          background: '#f8f8f8',
          surface: '#eeeeee',
          'surface-variant': '#e0e0e0',
          primary: '#5c6bc0', // Subtle indigo accent
          secondary: '#78909c',
          accent: '#7986cb',
          'on-surface': '#1a1a1a',
        }
      },
      dark: {
        dark: true,
        colors: {
          background: '#18181b',
          surface: '#27272a',
          'surface-variant': '#3f3f46',
          primary: '#818cf8', // Indigo for dark mode
          secondary: '#94a3b8',
          accent: '#a5b4fc',
          'on-surface': '#fafafa',
        }
      },
      system: {
        dark: window.matchMedia('(prefers-color-scheme: dark)').matches,
        colors: window.matchMedia('(prefers-color-scheme: dark)').matches
          ? {
              background: '#18181b',
              surface: '#27272a',
              'surface-variant': '#3f3f46',
              primary: '#818cf8',
              secondary: '#94a3b8',
              accent: '#a5b4fc',
              'on-surface': '#fafafa',
            }
          : {
              background: '#f8f8f8',
              surface: '#eeeeee',
              'surface-variant': '#e0e0e0',
              primary: '#5c6bc0',
              secondary: '#78909c',
              accent: '#7986cb',
              'on-surface': '#1a1a1a',
            }
      }
    }
  }
})

const app = createApp(App)
app.use(vuetify)
app.mount('#app')
