import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { createTestWaitlistEntry } from './setup.js'
import express from 'express'
import { registerRoutes } from '../server/routes.js'

describe('Waitlist API', () => {
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

  describe('POST /api/waitlist', () => {
    it('should successfully add user to waitlist with all fields', async () => {
      const waitlistData = createTestWaitlistEntry({
        name: 'Alice Johnson',
        email: 'alice@example.com',
        interests: 'Menopause support and AI health insights'
      })

      const response = await request(app)
        .post('/api/waitlist')
        .send(waitlistData)
        .expect(201)

      expect(response.body).toMatchObject({
        id: expect.any(String),
        name: waitlistData.name,
        email: waitlistData.email,
        message: "Successfully joined waitlist! Check your email for confirmation."
      })
    })

    it('should successfully add user to waitlist without interests field', async () => {
      const waitlistData = {
        name: 'Bob Smith',
        email: 'bob@example.com'
        // interests is optional
      }

      const response = await request(app)
        .post('/api/waitlist')
        .send(waitlistData)
        .expect(201)

      expect(response.body).toMatchObject({
        id: expect.any(String),
        name: waitlistData.name,
        email: waitlistData.email,
        message: "Successfully joined waitlist! Check your email for confirmation."
      })
    })

    it('should return 400 for missing required fields', async () => {
      const invalidData = {
        name: 'Test User'
        // missing email
      }

      const response = await request(app)
        .post('/api/waitlist')
        .send(invalidData)
        .expect(400)

      expect(response.body).toMatchObject({
        message: 'Invalid input'
      })
    })

    it('should return 400 for invalid email format', async () => {
      const invalidData = {
        name: 'Test User',
        email: 'invalid-email-format'
      }

      const response = await request(app)
        .post('/api/waitlist')
        .send(invalidData)
        .expect(400)

      expect(response.body).toMatchObject({
        message: 'Invalid input'
      })
    })

    it('should return 400 for empty name', async () => {
      const invalidData = {
        name: '',
        email: 'test@example.com'
      }

      const response = await request(app)
        .post('/api/waitlist')
        .send(invalidData)
        .expect(400)

      expect(response.body).toMatchObject({
        message: 'Invalid input'
      })
    })

    it('should return 409 for duplicate email', async () => {
      const waitlistData = createTestWaitlistEntry({
        name: 'First User',
        email: 'duplicate@example.com',
        interests: 'Health tracking'
      })

      // Add to waitlist first time
      await request(app)
        .post('/api/waitlist')
        .send(waitlistData)
        .expect(201)

      // Try to add same email again
      const duplicateData = {
        name: 'Second User',
        email: 'duplicate@example.com',
        interests: 'Different interests'
      }

      const response = await request(app)
        .post('/api/waitlist')
        .send(duplicateData)
        .expect(409)

      expect(response.body).toMatchObject({
        message: 'Email already registered'
      })
    })

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/waitlist')
        .send('invalid json')
        .expect(400)
    })

    it('should accept long interests text', async () => {
      const waitlistData = createTestWaitlistEntry({
        name: 'Sarah Wilson',
        email: 'sarah@example.com',
        interests: 'I am very interested in personalized health insights, especially around menopause symptoms, sleep tracking, mood analysis, and understanding hormonal changes. I would love to have an AI companion that can help me make sense of all the changes happening in my body.'
      })

      const response = await request(app)
        .post('/api/waitlist')
        .send(waitlistData)
        .expect(201)

      expect(response.body.name).toBe(waitlistData.name)
      expect(response.body.email).toBe(waitlistData.email)
    })

    it('should handle special characters in name', async () => {
      const waitlistData = createTestWaitlistEntry({
        name: 'María José O\'Connor-Smith',
        email: 'maria.jose@example.com',
        interests: 'Women\'s health & wellness'
      })

      const response = await request(app)
        .post('/api/waitlist')
        .send(waitlistData)
        .expect(201)

      expect(response.body.name).toBe(waitlistData.name)
    })

    it('should handle empty interests gracefully', async () => {
      const waitlistData = {
        name: 'Test User',
        email: 'empty@example.com',
        interests: ''
      }

      const response = await request(app)
        .post('/api/waitlist')
        .send(waitlistData)
        .expect(201)

      expect(response.body.name).toBe(waitlistData.name)
      expect(response.body.email).toBe(waitlistData.email)
    })

    it('should generate unique IDs for each waitlist entry', async () => {
      const entry1 = createTestWaitlistEntry({
        name: 'User One',
        email: 'user1@example.com'
      })

      const entry2 = createTestWaitlistEntry({
        name: 'User Two',
        email: 'user2@example.com'
      })

      const response1 = await request(app)
        .post('/api/waitlist')
        .send(entry1)
        .expect(201)

      const response2 = await request(app)
        .post('/api/waitlist')
        .send(entry2)
        .expect(201)

      expect(response1.body.id).not.toBe(response2.body.id)
      expect(response1.body.id).toBeTruthy()
      expect(response2.body.id).toBeTruthy()
    })
  })
})