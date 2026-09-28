const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export function apiUrl(path) {
  return `${apiBase}${path}`
}

export function configureAMap() {
  const key = import.meta.env.VITE_AMAP_KEY
  const serviceHost = import.meta.env.VITE_AMAP_SERVICE_HOST
  const securityJsCode = import.meta.env.VITE_AMAP_SECURITY_JS_CODE
  if (!key || (!serviceHost && !securityJsCode)) throw new Error('地图服务暂不可用')
  window._AMapSecurityConfig = serviceHost
    ? { serviceHost: new URL(serviceHost, window.location.origin).href }
    : { securityJsCode }
  return key
}
