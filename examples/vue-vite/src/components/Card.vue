<script setup lang="ts">
defineProps({
  title: { type: String, required: true },
});
</script>

<template>
  <section class="card">
    <h2 class="card-title">{{ title }}</h2>
    <div class="card-body">
      <slot />
    </div>
  </section>
</template>
