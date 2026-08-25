const OS_DASHBOARD_URL = 'https://findgagu-os-cursor.vercel.app/dashboard'
const PUBLIC_SHOWROOM_HOSTS = new Set(['findgagu.co.kr', 'www.findgagu.co.kr'])

export default function middleware(request) {
  const url = new URL(request.url)
  const hostname = url.hostname
  if (hostname === 'os.findgagu.co.kr') {
    return Response.redirect(OS_DASHBOARD_URL, 307)
  }
  if (PUBLIC_SHOWROOM_HOSTS.has(hostname) && url.pathname === '/') {
    const dest = new URL('/public/showroom', 'https://www.findgagu.co.kr')
    dest.search = url.search
    return Response.redirect(dest, 308)
  }
}

export const config = {
  matcher: ['/((?!api/).*)'],
}
