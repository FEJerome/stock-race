<template>
  <div id="app">
    <header class="app-header">
      <h1>AI Trading Platform</h1>
      <nav>
        <router-link to="/">Dashboard</router-link>
        <router-link to="/agents">AI Agents</router-link>
        <router-link to="/market">Market</router-link>
        <router-link to="/leaderboard">Leaderboard</router-link>
        <router-link to="/settings">Settings</router-link>
      </nav>
    </header>
    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
// App root component
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background: #f5f5f5;
}

.app-header {
  background: #2c3e50;
  color: white;
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.app-header h1 {
  font-size: 1.5rem;
}

.app-header nav {
  display: flex;
  gap: 1.5rem;
}

.app-header a {
  color: white;
  text-decoration: none;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.app-header a:hover,
.app-header a.router-link-active {
  opacity: 1;
}

.app-main {
  max-width: 1200px;
  margin: 2rem auto;
  padding: 0 1rem;
}
</style>
