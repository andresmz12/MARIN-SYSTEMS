import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash('trading2025', 10)

  const user = await prisma.user.upsert({
    where: { email: 'admin@marinsystems.com' },
    update: {},
    create: {
      email: 'admin@marinsystems.com',
      passwordHash,
      name: 'Marin Trader',
    },
  })

  console.log('✅ Usuario creado:', user.email)

  const defaultHabits = [
    { name: 'Revisar calendario económico', emoji: '📅', category: 'trading', frequency: 'diario', isPreMarket: true },
    { name: 'Análisis de mercado matutino', emoji: '📊', category: 'trading', frequency: 'diario', isPreMarket: true },
    { name: 'Revisión de trades del día', emoji: '📝', category: 'trading', frequency: 'diario', isPreMarket: false },
    { name: 'Ejercicio físico', emoji: '💪', category: 'salud', frequency: 'diario', isPreMarket: false },
    { name: 'Meditación', emoji: '🧘', category: 'salud', frequency: 'diario', isPreMarket: false },
    { name: 'Leer sobre trading', emoji: '📚', category: 'aprendizaje', frequency: 'diario', isPreMarket: false },
  ]

  for (const habit of defaultHabits) {
    const existingHabit = await prisma.habit.findFirst({
      where: { userId: user.id, name: habit.name },
    })
    if (!existingHabit) {
      await prisma.habit.create({
        data: { userId: user.id, ...habit },
      })
    }
  }

  console.log('✅ Hábitos iniciales creados')

  const defaultCompanies = [
    { name: 'ISM Consulting Services', emoji: '🏢', color: '#2563eb', status: 'activa', industry: 'Consultoría', description: 'Servicios de consultoría empresarial' },
    { name: 'Report System', emoji: '📊', color: '#7c3aed', status: 'activa', industry: 'SaaS/Tech', description: 'Plataforma SaaS de reportes y análisis' },
    { name: 'ISM Taxes', emoji: '🧾', color: '#16a34a', status: 'activa', industry: 'SaaS/Tech', description: 'Software de gestión de impuestos' },
    { name: 'ABC Midwest', emoji: '🧹', color: '#ea580c', status: 'activa', industry: 'Limpieza', description: 'Servicios de limpieza en el Midwest' },
    { name: "O'Globo Cargo", emoji: '📦', color: '#0891b2', status: 'activa', industry: 'Logística/Envíos', description: 'Logística y envíos internacionales' },
    { name: 'Meraki Real Estate', emoji: '🏠', color: '#ca8a04', status: 'activa', industry: 'Inmobiliaria', description: 'Inversiones y gestión inmobiliaria' },
  ]

  for (const company of defaultCompanies) {
    const existing = await prisma.company.findFirst({ where: { userId: user.id, name: company.name } })
    if (!existing) {
      await prisma.company.create({ data: { userId: user.id, ...company } })
    }
  }

  console.log('✅ Empresas iniciales creadas')

  await seedCEOCompanies()
  await seedMonitoredApps()

  console.log('\n🚀 Seed completado!')
  console.log('   Email: admin@marinsystems.com')
  console.log('   Password: trading2025')
}

async function seedCEOCompanies() {
  const firstUser = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!firstUser) {
    console.log('⚠️  No hay usuarios — se omite seed de CEO Command Center')
    return
  }

  const companies = [
    { name: 'ISM Consulting Services', color: '#6366f1', emoji: '📊', country: ['US'], strategicWeight: 5 },
    { name: 'Report System', color: '#10b981', emoji: '🧾', country: ['US'], strategicWeight: 5 },
    { name: 'ZyraVoice', color: '#f59e0b', emoji: '🎙️', country: ['US'], strategicWeight: 4 },
    { name: 'ABC Midwest Cleaning', color: '#3b82f6', emoji: '🧹', country: ['US', 'CO'], strategicWeight: 3 },
    { name: 'Meraki Real Estate', color: '#ec4899', emoji: '🏠', country: ['CO'], strategicWeight: 3 },
    { name: 'AM18K', color: '#f97316', emoji: '💎', country: ['CO'], strategicWeight: 3 },
  ]

  for (const company of companies) {
    const existing = await prisma.cEOCompany.findFirst({
      where: { userId: firstUser.id, name: company.name },
    })
    if (!existing) {
      await prisma.cEOCompany.create({ data: { userId: firstUser.id, ...company } })
    }
  }

  console.log('✅ Empresas CEO Command Center creadas')
}

async function seedMonitoredApps() {
  await prisma.monitoredApp.deleteMany()

  const apps = await prisma.monitoredApp.createMany({
    data: [
      {
        name: 'Agente de salud Report System',
        agentName: 'Ángela',
        role: 'Generación de Reportes Financieros',
        healthUrl: 'https://www.reportssystem.com/api/health',
        color: '#3B82F6',
      },
      {
        name: 'Agente de salud My Profit and Loss',
        agentName: 'Alejandro',
        role: 'Análisis de Rentabilidad',
        healthUrl: 'https://www.myprofitandloss.com/api/health',
        color: '#22C55E',
      },
    ],
  })

  console.log(`✅ MonitoredApps creadas: ${apps.count}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
