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
  console.log('\n🚀 Seed completado!')
  console.log('   Email: admin@marinsystems.com')
  console.log('   Password: trading2025')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
