import { afterEach, beforeEach } from 'vitest'
import { storage } from '../server/storage.js'

// Test setup utilities
export async function setupTestDatabase() {
  // Clear any existing data before each test
  if (storage instanceof (await import('../server/storage.js')).MemStorage) {
    // Reset in-memory storage
    const memStorage = storage as any
    memStorage.users.clear()
    memStorage.waitlistEntries.clear()
  }
}

export async function cleanupTestDatabase() {
  // Clean up after tests
  if (storage instanceof (await import('../server/storage.js')).MemStorage) {
    const memStorage = storage as any
    memStorage.users.clear()
    memStorage.waitlistEntries.clear()
  }
}

// Test data factories
export const createTestUser = (overrides = {}) => ({
  username: 'testuser@example.com',
  password: 'securePassword123',
  ...overrides,
})

export const createTestWaitlistEntry = (overrides = {}) => ({
  name: 'Test User',
  email: 'test@example.com',
  interests: 'AI health insights',
  ...overrides,
})

// Setup hooks
beforeEach(async () => {
  await setupTestDatabase()
})

afterEach(async () => {
  await cleanupTestDatabase()
})