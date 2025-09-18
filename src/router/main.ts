import { createRouter, createWebHistory } from 'vue-router'
import { useSettingsStore } from '../stores/settingsStore'
import { useGeneralStore } from '../stores/generalStore'
import MainComponent from '../components/Main.vue'

const routes = [
  {
    path: '/',
    name: 'Main',
    component: MainComponent,
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(
    import.meta.env.BASE_URL === '/vite-gh-pages/'
      ? '/'
      : import.meta.env.BASE_URL || '/'
  ),
  routes,
})

router.beforeEach(async (to, from, next) => {
  const settingsStore = useSettingsStore()
  const generalStore = useGeneralStore()

  if (!settingsStore.initialLoadAttempted) {
    await settingsStore.loadSettings()
  }

  if (
    to.name === 'Main' &&
    settingsStore.isProduction &&
    !settingsStore.areEssentialSettingsProvided
  ) {
    console.log(
      'Router: Essential settings missing in production. Will open settings window.'
    )
  }
  next()
})

export default router
