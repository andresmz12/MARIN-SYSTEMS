import { withAuth } from 'next-auth/middleware'

export default withAuth({
  pages: {
    signIn: '/login',
  },
})

// Solo protege PÁGINAS. Las rutas /api validan su propia sesión (devuelven 401 JSON, que
// es lo que esperan los fetch del cliente) o su propio secreto (crons, webhooks, imágenes
// públicas), así que quedan fuera. /studio es el enlace público compartible.
export const config = {
  matcher: ['/((?!api|login|studio|_next/static|_next/image|favicon.ico|manifest.json|sw.js).*)'],
}
