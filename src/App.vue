<template>
  <router-view />
  <div id="toast" :class="{ show: visible }">{{ msg }}</div>
</template>

<script setup lang="ts">
import { useToast } from '@/composables/useToast';
const { msg, visible } = useToast();
</script>
