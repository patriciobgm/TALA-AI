import { expect, test } from '@playwright/test';

test('sign-in page exposes normalized learner and teacher registration paths', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create learner account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create teacher account' })).toBeVisible();

  await page.getByRole('button', { name: 'Create learner account' }).click();
  await expect(page.getByRole('heading', { name: 'Create learner account' })).toBeVisible();
  await expect(page.getByLabel('LRN')).toBeVisible();
  await expect(page.getByLabel('Cluster')).toBeVisible();
  await expect(page.getByLabel('Grade level')).toBeVisible();
  await expect(page.getByLabel('Section')).toBeVisible();
  await expect(page.getByLabel('Adviser')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();

  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await page.getByRole('button', { name: 'Create teacher account' }).click();
  await expect(page.getByRole('heading', { name: 'Create teacher account' })).toBeVisible();
  await expect(page.getByLabel('Cluster')).toBeVisible();
  await expect(page.getByLabel('Grade level')).toHaveCount(0);
  await expect(page.getByLabel('Section')).toHaveCount(0);
});

test('teacher can sign in and open all five academic recovery reports', async ({ page }) => {
  await page.goto('/reports');
  await page.getByLabel('Email').fill('teacher@tala.edu.ph');
  await page.locator('input[type="password"]').fill('demo-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reports & Analytics' })).toBeVisible();
  await expect(page.getByText('Required Academic Recovery Reports')).toBeVisible();
  for (const label of ['Learner Recovery', 'Class / Subject', 'Assessment Performance', 'Learning Gaps', 'Interventions']) {
    await expect(page.getByRole('tab', { name: label })).toBeVisible();
  }
  await page.getByRole('tab', { name: 'Learning Gaps' }).click();
  await expect(page.getByText('Competency-level gaps, priority, classification, and resolution status.')).toBeVisible();
});

test('student sign-in reaches the academic recovery dashboard', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('student@tala.edu.ph');
  await page.locator('input[type="password"]').fill('demo-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Maria Santos').first()).toBeVisible();
  await expect(page.getByRole('navigation')).toBeVisible();
});

test('admin add-teacher form keeps cluster and subject assignment while omitting retired fields', async ({ page }) => {
  await page.goto('/learners?view=teachers');
  await page.getByLabel('Email').fill('admin@tala.edu.ph');
  await page.locator('input[type="password"]').fill('demo-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add Teacher' })).toBeVisible();
  await page.getByRole('button', { name: 'Add Teacher' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Cluster')).toBeVisible();
  await expect(dialog.getByLabel('Assigned Subjects')).toBeVisible();
  await expect(dialog.getByLabel('Employee ID')).toHaveCount(0);
  await expect(dialog.getByLabel('Date of birth')).toHaveCount(0);
  await expect(dialog.getByLabel('Contact number')).toHaveCount(0);
});

test('admin subject creation supports optional AI curriculum intake', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('admin@tala.edu.ph');
  await page.locator('input[type="password"]').fill('demo-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Subjects', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add Subject' })).toBeVisible();
  await page.getByRole('button', { name: 'Add Subject' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Curriculum or learning guide (optional)')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Choose file' })).toBeVisible();
  await expect(dialog.getByText('nothing is applied automatically', { exact: false })).toBeVisible();
});
