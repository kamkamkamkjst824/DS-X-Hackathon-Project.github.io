<script setup>
import { computed, onMounted, ref } from 'vue'
import { api, ApiError, clearSession, readSession, saveSession } from './auth.js'

const mode = ref('login')
const email = ref('')
const password = ref('')
const user = ref(null)
const busy = ref(false)
const checking = ref(true)
const error = ref('')
const needsRetry = ref(false)
const isRegister = computed(() => mode.value === 'register')

function switchMode(next) {
  mode.value = next
  password.value = ''
  error.value = ''
}

async function restoreSession() {
  checking.value = true
  needsRetry.value = false
  error.value = ''
  try {
    const session = readSession()
    if (!session) return
    const result = await api('/me', { token: session.token })
    user.value = result.user
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      clearSession()
      error.value = 'Your session has expired. Please sign in again.'
    } else {
      needsRetry.value = true
      error.value = cause.message
    }
  } finally {
    checking.value = false
  }
}

async function submit() {
  if (busy.value) return
  error.value = ''
  const normalizedEmail = email.value.trim().toLowerCase()
  if (!/^[^\s@]+@bu\.edu$/.test(normalizedEmail)) {
    error.value = 'Please use an @bu.edu email address.'
    return
  }
  if (password.value.length < 8 || password.value.length > 128) {
    error.value = 'Your password must be 8–128 characters long.'
    return
  }
  busy.value = true
  try {
    const result = await api(isRegister.value ? '/register' : '/login', {
      method: 'POST', body: { email: normalizedEmail, password: password.value },
    })
    try {
      saveSession(result)
    } catch {
      await api('/logout', { method: 'POST', token: result.token }).catch(() => {})
      throw new Error('Unable to save your session. Please enable local storage and try again.')
    }
    user.value = result.user
    email.value = result.user.email
    password.value = ''
    needsRetry.value = false
  } catch (cause) {
    error.value = cause.message
  } finally {
    busy.value = false
  }
}

async function logout() {
  busy.value = true
  error.value = ''
  try {
    const session = readSession()
    if (session) {
      try {
        await api('/logout', { method: 'POST', token: session.token })
      } catch (cause) {
        if (!(cause instanceof ApiError) || cause.status !== 401) throw cause
      }
    }
    clearSession()
    user.value = null
    password.value = ''
  } catch (cause) {
    error.value = cause.message
  } finally {
    busy.value = false
  }
}

onMounted(restoreSession)
</script>

<template>
  <main class="page">
    <section class="auth-card" aria-labelledby="page-title" :aria-busy="busy || checking">
      <div class="brand"><span class="brand-mark" aria-hidden="true">BU</span><span>CAMPUS ACCOUNT</span></div>
      <template v-if="checking">
        <h1 id="page-title">Checking your session</h1>
        <p class="intro" role="status">Just a moment…</p>
      </template>
      <template v-else-if="user">
        <h1 id="page-title">Welcome back</h1>
        <p class="intro">You’re signed in to your campus account.</p>
        <div class="account"><span class="account-label">Your email</span><p>{{ user.email }}</p></div>
        <p v-if="error" class="feedback" role="alert">{{ error }}</p>
        <button class="primary" :disabled="busy" @click="logout">{{ busy ? 'Signing out…' : 'Sign out' }}</button>
      </template>
      <template v-else-if="needsRetry">
        <h1 id="page-title">Unable to connect</h1>
        <p class="intro">Reconnect to continue using your account.</p>
        <p class="feedback" role="alert">{{ error }}</p>
        <button class="primary" @click="restoreSession">Try again</button>
      </template>
      <template v-else>
        <h1 id="page-title">{{ isRegister ? 'Create your account' : 'Welcome back' }}</h1>
        <p class="intro">{{ isRegister ? 'Get started with your BU email address.' : 'Sign in to your BU campus account.' }}</p>
        <div class="mode-switch" aria-label="Account action">
          <button type="button" :class="{ active: !isRegister }" :aria-pressed="!isRegister" :disabled="busy" @click="switchMode('login')">Sign in</button>
          <button type="button" :class="{ active: isRegister }" :aria-pressed="isRegister" :disabled="busy" @click="switchMode('register')">Register</button>
        </div>
        <form novalidate @submit.prevent="submit">
          <div class="field">
            <label for="email">Email</label>
            <input id="email" v-model="email" type="email" name="email" autocomplete="username" placeholder="name@bu.edu" required maxlength="254" :disabled="busy" aria-describedby="email-hint" />
            <p id="email-hint" class="hint">Use your @bu.edu email address</p>
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input id="password" v-model="password" type="password" name="password" :autocomplete="isRegister ? 'new-password' : 'current-password'" placeholder="Enter your password" required minlength="8" maxlength="128" :disabled="busy" aria-describedby="password-hint" />
            <p id="password-hint" class="hint">8–128 characters. No special symbols required.</p>
          </div>
          <p v-if="error" class="feedback" role="alert">{{ error }}</p>
          <button class="primary" type="submit" :disabled="busy">{{ busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in' }}</button>
        </form>
        <p class="footnote">Stay signed in on this device for 7 days</p>
      </template>
    </section>
  </main>
</template>
