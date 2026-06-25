const OS_DASHBOARD_URL = 'https://findgagu-os-cursor.vercel.app/dashboard'

export default function middleware(request) {
  const hostname = new URL(request.url).hostname
  if (hostname === 'os.findgagu.co.kr') {
    return Response.redirect(OS_DASHBOARD_URL, 307)
  }
}

export const config = {
  matcher: ['/((?!api/).*)'],
}
