<script setup>
import { ref } from 'vue'

const name = ref('')
</script>

<template>
  <div class="container">
    <h1>🍽️ Daily Dining Planner</h1>
    <p>Find the perfect meals based on your preferences!</p>

    <input
      v-model="name"
      placeholder="Enter your name"
    />

    <h2 v-if="name">Welcome, {{ name }}!</h2>

    <button>Get Started</button>
  </div>
</template>

<style scoped>
.container {
  text-align: center;
  padding: 50px;
  font-family: Arial, sans-serif;
}

button {
  padding: 12px 24px;
  background-color: #4CAF50;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}
</style>