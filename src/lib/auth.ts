import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import bcrypt from 'bcryptjs'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null

        // Rate limit: 5 attempts per 15 minutes per IP
        const ip = (req?.headers?.['x-forwarded-for'] as string)?.split(',')[0] ?? 'unknown'
        const allowed = rateLimit(`login:${ip}`, 5, 15 * 60 * 1000)
        if (!allowed) throw new Error('Demasiados intentos. Intenta en 15 minutos.')

        const email = credentials.email.toLowerCase().trim()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null

        const user = await prisma.user.findUnique({ where: { email } })

        // Always run bcrypt to prevent timing attacks
        const hash = user?.passwordHash ?? '$2a$10$invalidhashpadding000000000000000000000000000000000000'
        const isValid = await bcrypt.compare(credentials.password, hash)

        if (!user || !isValid) return null

        return { id: user.id, email: user.email, name: user.name }
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 }, // 8-hour session
  pages: { signIn: '/login' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
      }
      return session
    },
  },
}
