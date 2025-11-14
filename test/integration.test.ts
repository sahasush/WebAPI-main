import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { createTestUser, createTestWaitlistEntry } from './setup.js'
import express from 'express'
import { registerRoutes } from '../server/routes.js'

describe('User Journey Integration Tests', () => {
  let app: Express
  let server: any

  beforeAll(async () => {
    app = express()
    app.use(express.json())
    server = await registerRoutes(app)
  })

  afterAll(async () => {
    if (server) {
      server.close()
    }
  })

  describe('Complete User Journey', () => {
    it('should support full user lifecycle: register -> login -> waitlist', async () => {
      const userData = createTestUser({
        username: 'journey@example.com',
        password: 'securePassword123'
      })

      // Step 1: Register user
      const registerResponse = await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      expect(registerResponse.body).toMatchObject({
        id: expect.any(String),
        username: userData.username
      })

      // Step 2: Login with registered credentials
      const loginResponse = await request(app)
        .post('/api/login')
        .send({
          username: userData.username,
          password: userData.password
        })
        .expect(200)

      expect(loginResponse.body).toMatchObject({
        id: registerResponse.body.id,
        username: userData.username,
        message: 'Login successful'
      })

      // Step 3: Join waitlist (separate from user registration)
      const waitlistData = createTestWaitlistEntry({
        name: 'Journey User',
        email: userData.username, // Using same email as username
        interests: 'Full integration testing'
      })

      const waitlistResponse = await request(app)
        .post('/api/waitlist')
        .send(waitlistData)
        .expect(201)

      expect(waitlistResponse.body).toMatchObject({
        id: expect.any(String),
        name: waitlistData.name,
        email: waitlistData.email,
        message: "Successfully joined waitlist! Check your email for confirmation."
      })
    })

    it('should handle multiple users in parallel', async () => {
      const userCount = 10
      const users: Array<{ username: string; password: string }> = []

      // Generate test users
      for (let i = 0; i < userCount; i++) {
        users.push(createTestUser({
          username: `parallel${i}@example.com`,
          password: `password${i}123`
        }))
      }

      // Register all users in parallel
      const registerPromises = users.map(userData =>
        request(app).post('/api/register').send(userData)
      )

      const registerResponses = await Promise.all(registerPromises)

      // All registrations should succeed
      registerResponses.forEach((response, index) => {
        expect(response.status).toBe(201)
        expect(response.body.username).toBe(users[index].username)
      })

      // Login all users in parallel
      const loginPromises = users.map(userData =>
        request(app).post('/api/login').send({
          username: userData.username,
          password: userData.password
        })
      )

      const loginResponses = await Promise.all(loginPromises)

      // All logins should succeed
      loginResponses.forEach((response, index) => {
        expect(response.status).toBe(200)
        expect(response.body.username).toBe(users[index].username)
        expect(response.body.id).toBe(registerResponses[index].body.id)
      })
    })

    it('should maintain data consistency across operations', async () => {
      const userData = createTestUser({
        username: 'consistency@example.com',
        password: 'securePassword123'
      })

      // Register user
      const registerResponse = await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      const userId = registerResponse.body.id

      // Multiple login operations should return consistent user ID
      for (let i = 0; i < 5; i++) {
        const loginResponse = await request(app)
          .post('/api/login')
          .send({
            username: userData.username,
            password: userData.password
          })
          .expect(200)

        expect(loginResponse.body.id).toBe(userId)
        expect(loginResponse.body.username).toBe(userData.username)
      }
    })

    it('should handle user registration with immediate duplicate prevention', async () => {
      const userData = createTestUser({
        username: 'duplicate@example.com',
        password: 'securePassword123'
      })

      // First registration should succeed
      const firstResponse = await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      // Immediate duplicate attempt should fail
      const duplicateResponse = await request(app)
        .post('/api/register')
        .send(userData)
        .expect(409)

      expect(duplicateResponse.body.message).toBe('User already exists')

      // Original user should still be able to login
      const loginResponse = await request(app)
        .post('/api/login')
        .send({
          username: userData.username,
          password: userData.password
        })
        .expect(200)

      expect(loginResponse.body.id).toBe(firstResponse.body.id)
    })
  })

  describe('Error Handling Integration', () => {
    it('should handle mixed valid and invalid operations gracefully', async () => {
      const validUser = createTestUser({
        username: 'valid@example.com',
        password: 'securePassword123'
      })

      // Register valid user
      await request(app)
        .post('/api/register')
        .send(validUser)
        .expect(201)

      // Try invalid operations mixed with valid ones
      const operations = [
        // Valid login
        request(app).post('/api/login').send({
          username: validUser.username,
          password: validUser.password
        }),
        // Invalid login (wrong password)
        request(app).post('/api/login').send({
          username: validUser.username,
          password: 'wrongpassword'
        }),
        // Valid login again
        request(app).post('/api/login').send({
          username: validUser.username,
          password: validUser.password
        }),
        // Invalid registration (duplicate)
        request(app).post('/api/register').send(validUser)
      ]

      const responses = await Promise.all(operations)

      expect(responses[0].status).toBe(200) // Valid login
      expect(responses[1].status).toBe(401) // Invalid login
      expect(responses[2].status).toBe(200) // Valid login
      expect(responses[3].status).toBe(409) // Duplicate registration
    })

    it('should maintain service availability during invalid requests', async () => {
      // Send many invalid requests
      const invalidRequests = Array(20).fill(null).map(() => [
        request(app).post('/api/register').send({ invalid: 'data' }),
        request(app).post('/api/login').send({ invalid: 'data' }),
        request(app).post('/api/waitlist').send({ invalid: 'data' })
      ]).flat()

      const responses = await Promise.all(invalidRequests)

      // All should return 400 errors, but service should remain available
      responses.forEach(response => {
        expect([400, 401].includes(response.status)).toBe(true)
      })

      // Service should still work for valid requests
      const validUser = createTestUser({
        username: 'stillworks@example.com',
        password: 'securePassword123'
      })

      const registerResponse = await request(app)
        .post('/api/register')
        .send(validUser)
        .expect(201)

      await request(app)
        .post('/api/login')
        .send({
          username: validUser.username,
          password: validUser.password
        })
        .expect(200)
    })
  })

  describe('Performance and Load Tests', () => {
    it('should handle rapid sequential user registrations', async () => {
      const userCount = 50
      const users: Array<{ userData: any; response: any }> = []

      const startTime = Date.now()

      // Create users sequentially
      for (let i = 0; i < userCount; i++) {
        const userData = createTestUser({
          username: `rapid${i}@example.com`,
          password: `password${i}123`
        })

        const response = await request(app)
          .post('/api/register')
          .send(userData)
          .expect(201)

        users.push({ userData, response: response.body })
      }

      const endTime = Date.now()
      const totalTime = endTime - startTime

      // Should complete within reasonable time (adjust threshold as needed)
      expect(totalTime).toBeLessThan(10000) // 10 seconds

      // All users should have unique IDs
      const ids = users.map(u => u.response.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(userCount)

      // Verify all users can login
      for (const { userData } of users) {
        await request(app)
          .post('/api/login')
          .send({
            username: userData.username,
            password: userData.password
          })
          .expect(200)
      }
    })

    it('should handle burst of concurrent operations', async () => {
      const burstSize = 30
      const operations = []

      // Mix of registration, login, and waitlist operations
      for (let i = 0; i < burstSize; i++) {
        if (i % 3 === 0) {
          // Registration
          operations.push(
            request(app).post('/api/register').send(createTestUser({
              username: `burst${i}@example.com`,
              password: 'password123'
            }))
          )
        } else if (i % 3 === 1) {
          // Waitlist
          operations.push(
            request(app).post('/api/waitlist').send(createTestWaitlistEntry({
              name: `Burst User ${i}`,
              email: `burstlist${i}@example.com`
            }))
          )
        } else {
          // Invalid operation (should be handled gracefully)
          operations.push(
            request(app).post('/api/login').send({
              username: 'nonexistent@example.com',
              password: 'password'
            })
          )
        }
      }

      const startTime = Date.now()
      const responses = await Promise.all(operations)
      const endTime = Date.now()

      expect(endTime - startTime).toBeLessThan(5000) // 5 seconds

      // Count successful operations
      const successCount = responses.filter(r => r.status === 201).length
      const failureCount = responses.filter(r => [400, 401, 409].includes(r.status)).length

      expect(successCount + failureCount).toBe(burstSize)
      expect(successCount).toBeGreaterThan(0)
    })
  })
})