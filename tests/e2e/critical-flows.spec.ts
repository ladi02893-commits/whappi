import { test, expect } from '@playwright/test'

test('protects chat routes and exposes Gmail/password login', async ({
  page,
}) => {
  await page.goto('/chat')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible()
  await expect(page.getByLabel('Gmail')).toBeVisible()
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
})

test('registration and password recovery expose the required fields', async ({
  page,
}) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /create account/i }).click()
  await expect(page.getByLabel('Full name')).toBeVisible()
  await expect(page.getByLabel('Gmail')).toBeVisible()
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Confirm password')).toBeVisible()
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.getByRole('button', { name: /forgot password/i }).click()
  await expect(page.getByLabel('Registered Gmail')).toBeVisible()
  await expect(
    page.getByRole('button', { name: /send reset code/i }),
  ).toBeVisible()
})

test.describe('authenticated critical flows', () => {
  test.skip(
    !process.env.PLAYWRIGHT_AUTH_STATE,
    'Set PLAYWRIGHT_AUTH_STATE to an authenticated WHAPPI storage state.',
  )
  test.use({ storageState: process.env.PLAYWRIGHT_AUTH_STATE })

  test('discovers users and exposes friend request actions', async ({
    page,
  }) => {
    await page.goto('/chat')
    await page.getByRole('button', { name: /discover/i }).click()
    await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible()
    await page.getByLabel('Search people').fill('RLS User')
    await expect(page.locator('article').first()).toBeVisible()
  })

  test('opens a conversation and supports text, emoji, attachments, retention, and clear chat controls', async ({
    page,
  }) => {
    await page.goto('/chat')
    const conversation = page.locator('aside section button').first()
    await conversation.click()
    await expect(page.getByLabel('Message')).toBeVisible()
    await page.getByLabel('Message').fill('Hello from Playwright')
    await page.getByLabel('Message').press('Enter')
    await expect(page.getByText('Hello from Playwright')).toBeVisible()
    await page.getByLabel('Delete message').click()
    await expect(page.getByText('Delete this message?')).toBeVisible()
    await expect(
      page.getByRole('button', { name: /delete for everyone/i }),
    ).toBeVisible()
    await page.getByRole('button', { name: /cancel/i }).click()
    await page.getByLabel('Choose emoji').click()
    await expect(page.locator('.EmojiPickerReact')).toBeVisible()
    await page.getByLabel('Add attachment').click()
    await expect(page.getByText('Document', { exact: true })).toBeVisible()
    await page.getByLabel('Conversation options').click()
    await expect(page.getByText('Disappearing messages')).toBeVisible()
    await expect(page.getByText('Clear all messages for me')).toBeVisible()
  })
})
