<script setup lang="ts">
defineProps<{ label: string }>();
</script>

<template>
  <button type="button" class="ds-button">{{ label }}</button>
</template>
