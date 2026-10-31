import { expect, test, type Page } from '@playwright/test'

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

async function signIn(page: Page) {
  const { email, password } = e2eCredentials()

  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/vacancies$/)
}

test.describe.serial('autenticación E2E', () => {
  test('inicia sesión, cierra sesión y protege las rutas privadas', async ({ page }) => {
    await signIn(page)
    await expect(page.getByRole('heading', { name: 'Vacantes', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Cerrar sesión' }).click()

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()

    await page.goto('/vacancies')

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
  })

  test('crea un flujo, una vacante abierta y una postulación desde Candidates', async ({ page }, testInfo) => {
    const suffix = (9_999_999_999_999 - Date.now()).toString()
    const pipelineInputName = `a e2e ${suffix}`
    const pipelineName = `A e2e ${suffix}`
    const firstStageInputName = `aplicar ${suffix}`
    const firstStageName = `Aplicar ${suffix}`
    const candidateFirstName = 'Candidato'
    const candidateLastName = `A e2e ${suffix}`
    const candidateName = `${candidateFirstName} ${candidateLastName}`
    const candidateEmail = `candidate-${suffix}-${testInfo.retry}@e2e.test`
    const vacancyTitle = `A e2e ${suffix}`
    const companyName = `Empresa e2e ${suffix}`

    await signIn(page)

    await page.getByRole('link', { name: 'Flujos de selección' }).click()
    await expect(page.getByRole('heading', { name: 'Flujos de selección' })).toBeVisible()
    await page.getByRole('button', { name: 'Crear pipeline' }).click()
    await expect(page.getByRole('heading', { name: 'Crear pipeline' })).toBeVisible()
    await page.getByLabel('Nombre del pipeline').fill(pipelineInputName)
    await page.getByRole('textbox', { name: 'Etapa 1', exact: true }).fill(firstStageInputName)
    await page.getByRole('textbox', { name: 'Etapa 2', exact: true }).fill(`entrevista ${suffix}`)
    await page.getByRole('textbox', { name: 'Etapa 3', exact: true }).fill(`oferta ${suffix}`)
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page).toHaveURL(/\/pipelines$/)

    await page.getByRole('link', { name: 'Candidatos' }).click()
    await expect(page.getByRole('heading', { name: 'Candidatos' })).toBeVisible()
    await page.getByRole('button', { name: 'Crear candidato' }).click()
    const candidateDialog = page.getByRole('dialog', { name: 'Crear candidato' })
    await candidateDialog.getByLabel('Nombre').fill(candidateFirstName)
    await candidateDialog.getByLabel('Apellido').fill(candidateLastName)
    await candidateDialog.getByLabel('Correo electrónico').fill(candidateEmail)
    await candidateDialog.getByRole('button', { name: 'Guardar candidato' }).click()
    await expect(candidateDialog).toBeHidden()

    await page.getByRole('link', { name: 'Vacantes' }).click()
    await expect(page.getByRole('heading', { name: 'Vacantes', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Crear vacante' }).click()
    const vacancyDialog = page.getByRole('dialog', { name: 'Crear vacante' })
    await vacancyDialog.getByLabel('Título').fill(vacancyTitle)
    await vacancyDialog.getByLabel('Empresa').fill(companyName)
    await vacancyDialog.getByLabel('Descripción').fill('Vacante creada para la cobertura E2E.')
    await vacancyDialog.getByRole('combobox', { name: 'Pipeline' }).fill(pipelineName)
    await vacancyDialog.getByRole('option', { name: pipelineName, exact: true }).click()
    await vacancyDialog.getByRole('button', { name: 'Guardar vacante' }).click()
    await expect(vacancyDialog).toBeHidden()

    const vacancyRow = page.getByRole('row').filter({ hasText: vacancyTitle })
    await expect(vacancyRow).toBeVisible()
    await vacancyRow.getByRole('button', { name: /^Ver(?: .*)?$/ }).click()
    await expect(page.getByRole('heading', { name: vacancyTitle })).toBeVisible()
    await page.getByRole('button', { name: 'Abrir vacante' }).click()
    const openDialog = page.getByRole('dialog', { name: 'Abrir vacante' })
    await openDialog.getByRole('button', { name: 'Confirmar apertura' }).click()
    await expect(page.getByLabel('Estado: OPEN')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Agregar postulación' })).toBeVisible()

    await page.getByRole('link', { name: 'Candidatos' }).click()
    const candidateCard = page.locator('article').filter({ hasText: candidateName })
    await expect(candidateCard).toBeVisible()
    await candidateCard.getByRole('button', { name: 'Agregar a vacante' }).click()
    const addToVacancyDialog = page.getByRole('dialog', { name: 'Agregar a vacante' })
    const vacancyCombobox = addToVacancyDialog.getByRole('combobox', { name: 'Vacante' })
    await expect(vacancyCombobox).toBeVisible()
    await vacancyCombobox.fill(vacancyTitle)
    await addToVacancyDialog.getByRole('option').filter({ hasText: vacancyTitle }).click()
    await addToVacancyDialog.getByRole('button', { name: 'Agregar a vacante' }).click()
    await expect(addToVacancyDialog).toBeHidden()

    await page.getByRole('link', { name: 'Vacantes' }).click()
    await expect(vacancyRow).toBeVisible()
    await vacancyRow.getByRole('button', { name: /^Ver(?: .*)?$/ }).click()
    const firstStage = page.getByLabel(`Etapa ${firstStageName}`)
    await expect(firstStage.getByText(candidateName, { exact: true })).toBeVisible()

    await page.getByRole('link', { name: 'Flujos de selección' }).click()
    const pipelineRow = page.getByRole('row').filter({ hasText: pipelineName })
    await expect(pipelineRow).toBeVisible()
    await expect(pipelineRow.getByRole('button', { name: 'Editar' })).toHaveCount(0)
    await expect(pipelineRow.getByRole('button', { name: 'Eliminar' })).toHaveCount(0)
  })

  test('gestiona postulaciones durante el ciclo de vida de una vacante', async ({ page }, testInfo) => {
    const suffix = (9_999_999_999_999 - Date.now()).toString()
    const candidates = [
      {
        firstName: 'Aplicante',
        lastName: `A uno ${suffix}`,
        email: `applicant-one-${suffix}-${testInfo.retry}@e2e.test`,
      },
      {
        firstName: 'Aplicante',
        lastName: `A dos ${suffix}`,
        email: `applicant-two-${suffix}-${testInfo.retry}@e2e.test`,
      },
    ]
    const [candidateToMove, candidateToRemove] = candidates
    const candidateToMoveName = `${candidateToMove.firstName} ${candidateToMove.lastName}`
    const candidateToRemoveName = `${candidateToRemove.firstName} ${candidateToRemove.lastName}`
    const vacancyTitle = `A ciclo e2e ${suffix}`

    await signIn(page)

    await page.getByRole('link', { name: 'Candidatos' }).click()
    await expect(page.getByRole('heading', { name: 'Candidatos' })).toBeVisible()
    for (const candidate of candidates) {
      await page.getByRole('button', { name: 'Crear candidato' }).click()
      const candidateDialog = page.getByRole('dialog', { name: 'Crear candidato' })
      await candidateDialog.getByLabel('Nombre').fill(candidate.firstName)
      await candidateDialog.getByLabel('Apellido').fill(candidate.lastName)
      await candidateDialog.getByLabel('Correo electrónico').fill(candidate.email)
      await candidateDialog.getByRole('button', { name: 'Guardar candidato' }).click()
      await expect(candidateDialog).toBeHidden()
    }

    await page.getByRole('link', { name: 'Vacantes' }).click()
    await expect(page.getByRole('heading', { name: 'Vacantes', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Crear vacante' }).click()
    const vacancyDialog = page.getByRole('dialog', { name: 'Crear vacante' })
    await vacancyDialog.getByLabel('Título').fill(vacancyTitle)
    await vacancyDialog.getByLabel('Empresa').fill(`Empresa ciclo e2e ${suffix}`)
    await vacancyDialog.getByLabel('Descripción').fill('Vacante para verificar el ciclo de postulaciones E2E.')
    await vacancyDialog.getByRole('combobox', { name: 'Pipeline' }).fill('Default')
    await vacancyDialog.getByRole('option', { name: 'Default', exact: true }).click()
    await vacancyDialog.getByRole('button', { name: 'Guardar vacante' }).click()
    await expect(vacancyDialog).toBeHidden()

    await page.getByLabel('Buscar por título').fill(vacancyTitle)
    await page.getByRole('button', { name: 'Buscar' }).click()
    const vacancyRow = page.getByRole('row').filter({ hasText: vacancyTitle })
    await expect(vacancyRow).toBeVisible()
    await vacancyRow.getByRole('button', { name: /^Ver(?: .*)?$/ }).click()
    await expect(page.getByRole('heading', { name: vacancyTitle })).toBeVisible()
    await page.getByRole('button', { name: 'Abrir vacante' }).click()
    const openDialog = page.getByRole('dialog', { name: 'Abrir vacante' })
    await openDialog.getByRole('button', { name: 'Confirmar apertura' }).click()
    await expect(page.getByRole('button', { name: 'Agregar postulación' })).toBeVisible()

    for (const candidate of candidates) {
      const candidateName = `${candidate.firstName} ${candidate.lastName}`
      await page.getByRole('button', { name: 'Agregar postulación' }).click()
      const addApplicationDialog = page.getByRole('dialog', { name: 'Agregar postulación' })
      const candidateCombobox = addApplicationDialog.getByRole('combobox', { name: 'Candidato' })
      await candidateCombobox.fill(candidateName)
      await addApplicationDialog.getByRole('option').filter({ hasText: candidateName }).click()
      await addApplicationDialog.getByRole('button', { name: 'Agregar postulación' }).click()
      await expect(addApplicationDialog).toBeHidden()
    }

    const appliedStage = page.getByLabel('Etapa Applied')
    const interviewStage = page.getByLabel('Etapa Interview')
    const movableApplication = appliedStage.locator('article').filter({ hasText: candidateToMoveName })
    await expect(movableApplication).toBeVisible()
    await movableApplication.getByRole('button', { name: 'Mover' }).click()
    const moveDialog = page.getByRole('dialog', { name: 'Mover postulación' })
    await moveDialog.getByRole('radio', { name: 'Interview', exact: true }).check()
    await moveDialog.getByRole('button', { name: 'Mover postulación' }).click()
    await expect(moveDialog).toBeHidden()
    await expect(interviewStage.getByText(candidateToMoveName, { exact: true })).toBeVisible()
    await expect(appliedStage.getByText(candidateToMoveName, { exact: true })).toHaveCount(0)

    const removableApplication = appliedStage.locator('article').filter({ hasText: candidateToRemoveName })
    await expect(removableApplication).toBeVisible()
    await removableApplication.getByRole('button', { name: 'Eliminar' }).click()
    const removeDialog = page.getByRole('dialog', { name: 'Eliminar postulación' })
    await removeDialog.getByRole('button', { name: 'Eliminar' }).click()
    await expect(removeDialog).toBeHidden()
    await expect(appliedStage.getByText(candidateToRemoveName, { exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: 'Cerrar vacante' }).click()
    const closeDialog = page.getByRole('dialog', { name: 'Cerrar vacante' })
    await closeDialog.getByRole('radio', { name: 'Cubierta' }).check()
    await closeDialog.getByRole('button', { name: 'Confirmar cierre' }).click()
    await expect(page.getByLabel('Estado: FILLED')).toBeVisible()
    await expect(interviewStage.getByText(candidateToMoveName, { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Agregar postulación' })).toHaveCount(0)
    await expect(interviewStage.getByRole('button', { name: 'Mover' })).toHaveCount(0)
    await expect(interviewStage.getByRole('button', { name: 'Eliminar' })).toHaveCount(0)
  })
})
