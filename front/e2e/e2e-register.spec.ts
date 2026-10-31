import { expect, test } from '@playwright/test'

const emailPattern = /^[^\s@]+@[^\s@]+$/

function e2eCredentials() {
  const email = process.env.E2E_RECRUITER_EMAIL
  const password = process.env.E2E_RECRUITER_PASSWORD

  if (!email || !password) {
    throw new Error('Faltan las credenciales E2E requeridas.')
  }

  if (!emailPattern.test(email)) {
    throw new Error('El correo E2E no tiene un formato válido.')
  }

  if (password.length < 15 || password.length > 128) {
    throw new Error('La contraseña E2E debe tener entre 15 y 128 caracteres.')
  }

  return { email, password }
}

if (process.env.E2E_REGISTER_ACCOUNT === '1') {
  test('registra la cuenta E2E mediante la interfaz', async ({ page }) => {
    const { email, password } = e2eCredentials()

    await page.goto('/register')
    await expect(page.getByRole('heading', { name: 'Crear cuenta' })).toBeVisible()

    await page.getByLabel('Nombre').fill('E2E')
    await page.getByLabel('Apellido').fill('Recruiter')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.locator('#register-password').fill(password)
    await page.locator('#register-confirm-password').fill(password)
    await page.getByRole('button', { name: 'Crear cuenta' }).click()

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
    await expect(page.getByText('Tu cuenta fue creada correctamente.')).toBeVisible()
  })
}
