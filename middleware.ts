import { withAuth } from 'next-auth/middleware'

export default withAuth({
  pages: {
    signIn: '/login',
  },
})

export const config = {
  matcher: ['/((?!login|studio|api/auth|api/studio|_next/static|_next/image|favicon.ico).*)'],
}
