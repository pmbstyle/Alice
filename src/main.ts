import './assets/styles.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router/main.ts'
import { initializeClients } from './services/apiClients'

import App from './App.vue'

const app = createApp(App)

app.use(createPinia())
app.use(router)

async function mountApp(): Promise<void> {
  try {
    await router.isReady()
  } catch (error) {
    console.error('Router failed to finish initial navigation:', error)
  }
  app.mount('#app')
}

// Initialize clients and then mount the app
initializeClients()
  .then(() => {
    console.log('All clients initialized, mounting app')
  })
  .catch(error => {
    console.error('Failed to initialize clients, mounting app anyway:', error)
  })
  .finally(() => {
    mountApp()
  })
