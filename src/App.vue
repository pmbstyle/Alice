<template>
  <Main v-if="!showOverlay" />
  <Overlay v-else />
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import Main from './components/Main.vue'
import Overlay from './components/Overlay.vue'
import { computed } from 'vue'

const route = useRoute()
const showOverlay = computed(() => {
  return route.hash === '#overlay'
})
</script>

<style scoped lang="postcss"></style>
