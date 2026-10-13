import { expect, test } from '@playwright/test'

// The draft application e2e/run.mjs seeds for the E2E_APPLICANT_SESSION owner.
const seededApplicationId = '00000000-0000-4000-8000-000000000010'

test('application form lays out actions without forwarding style props to the DOM', async ({
  baseURL,
  page,
}) => {
  const applicantSession = process.env.E2E_APPLICANT_SESSION
  test.skip(
    !applicantSession || !baseURL,
    'Run through npm run test:e2e to seed an applicant session.',
  )
  await page.context().addCookies([
    {
      name: '__Host-KYCSESSION',
      value: applicantSession!,
      // A Secure cookie cannot be set from an http URL, so name its host.
      domain: new URL(baseURL!).hostname,
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])

  const reactWarnings: string[] = []
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      message.text().includes('justifyContent')
    ) {
      reactWarnings.push(message.text())
    }
  })

  await page.goto(`/applications/${seededApplicationId}/personal-details`)

  // Back shares the actions row with the Save and Continue group.
  const actions = page.getByRole('button', { name: 'Back' }).locator('xpath=..')
  await expect(actions).toHaveCSS('justify-content', 'space-between')
  expect(reactWarnings).toEqual([])
})
