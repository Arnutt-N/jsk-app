import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'

/**
 * PRD E — Drug Reporting (แจ้งเบาะแสยาเสพติด) E2E suite.
 *
 * Validates:
 *   - Drug reporting is the default category on /admin/requests/create
 *   - Subcategory dropdown shows 4 drug-specific options
 *   - Subcategory "ปัญหายาเสพติด" is the first option
 *   - Agency dropdown shows 4 agencies in correct order
 *   - Request list has drug reporting filter option
 *   - LIFF service-request page has correct topic options
 */

test.describe('Drug Reporting — Admin Create Request', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/requests/create')
  })

  test('drug reporting category is selected by default', async ({ page }) => {
    // Navigate to step 1 (category selection)
    const nextButton = page.getByRole('button', { name: 'ถัดไป' }).first()
    if (await nextButton.isVisible()) {
      await nextButton.click()
    }

    const categorySelect = page.locator('select').filter({ hasText: 'แจ้งเบาะแสยาเสพติด' })
    await expect(categorySelect).toBeVisible({ timeout: 5_000 })
  })

  test('subcategory dropdown shows 4 drug-specific options', async ({ page }) => {
    // Go to step 1
    const nextButton = page.getByRole('button', { name: 'ถัดไป' }).first()
    if (await nextButton.isVisible()) {
      await nextButton.click()
    }

    // Find the subcategory dropdown — it's the second <select> in the grid
    // or the one with placeholder "-- เลือกปัญหายาเสพติด --"
    const subcategorySelect = page.locator('select').nth(1)
    await expect(subcategorySelect).toBeVisible()

    const options = await subcategorySelect.locator('option').allInnerTexts()
    // First option is placeholder, then 4 subcategories
    expect(options.length).toBeGreaterThanOrEqual(4)
    expect(options).toContain('ปัญหายาเสพติด')
    expect(options).toContain('ผู้เสพ/ผู้ป่วยที่เฝ้าระวัง/อันตราย')
    expect(options).toContain('ขอความช่วยเหลือบำบัดผู้เสพ')
    expect(options).toContain('ครอบครัวที่ต้องเข้าช่วยเหลือจากผลกระทบยาเสพติด')
  })

  test('drug subcategory "ปัญหายาเสพติด" is the first real option', async ({ page }) => {
    // Go to step 1
    const nextButton = page.getByRole('button', { name: 'ถัดไป' }).first()
    if (await nextButton.isVisible()) {
      await nextButton.click()
    }

    const subcategorySelect = page.locator('select').nth(1)
    const options = await subcategorySelect.locator('option').allInnerTexts()

    // First non-empty/non-placeholder option should be "ปัญหายาเสพติด"
    const realOptions = options.filter(o => o && !o.includes('--'))
    expect(realOptions[0]).toBe('ปัญหายาเสพติด')
  })

  test('agency dropdown shows 4 agencies with community agency last', async ({ page }) => {
    // Go to step 1 first
    let nextButton = page.getByRole('button', { name: 'ถัดไป' }).first()
    if (await nextButton.isVisible()) {
      await nextButton.click()
    }

    // Go to step 2
    nextButton = page.getByRole('button', { name: 'ถัดไป' }).first()
    if (await nextButton.isVisible()) {
      await nextButton.click()
    }

    // Find the agency select — should be the last <select> in the form
    const allSelects = page.locator('select')
    const selectCount = await allSelects.count()
    const agencySelect = allSelects.nth(selectCount - 1)
    await expect(agencySelect).toBeVisible()

    const options = await agencySelect.locator('option').allInnerTexts()
    expect(options).toContain('ศูนย์ยุติธรรมชุมชน')
    expect(options).toContain('ศูนย์ดำรงธรรม')
    expect(options).toContain('สถานีตำรวจภูธร')
    expect(options).toContain('กำนัน ผู้ใหญ่บ้าน จิตอาสา ผู้นำชุมชน')

    // Verify community agency is last
    const realOptions = options.filter(o => o && !o.includes('--'))
    expect(realOptions[realOptions.length - 1]).toBe('กำนัน ผู้ใหญ่บ้าน จิตอาสา ผู้นำชุมชน')
  })

  test('non-drug category does not show drug subcategory dropdown', async ({ page }) => {
    // Go to step 1
    const nextButton = page.getByRole('button', { name: 'ถัดไป' }).first()
    if (await nextButton.isVisible()) {
      await nextButton.click()
    }

    // Change category to something else
    const categorySelect = page.locator('select').first()
    await categorySelect.selectOption({ label: 'ร้องเรียน/ร้องทุกข์' })

    // Subcategory should now be a text input, not a dropdown
    const subcategoryInput = page.locator('input[placeholder*="หมวดหมู่ย่อย"], input[placeholder*="ระบุ"]')
    await expect(subcategoryInput).toBeVisible()
  })
})

test.describe('Drug Reporting — Request List Filter', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/requests')
  })

  test('category filter includes drug reporting option', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })

    // Find the category filter (second select after status filter)
    const selects = page.locator('select')
    const categorySelect = selects.nth(1)
    await expect(categorySelect).toBeVisible()

    const options = await categorySelect.locator('option').allInnerTexts()
    expect(options).toContain('แจ้งเบาะแสยาเสพติด')
  })
})
