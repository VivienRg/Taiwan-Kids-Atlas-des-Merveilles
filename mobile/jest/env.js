process.env.EXPO_PUBLIC_API_MODE = 'mock'

// react-test-renderer + scheduler.native expect a browser-ish global.
const win =
  typeof window === 'undefined'
    ? // eslint-disable-next-line no-global-assign
      (global.window = {})
    : window
win.dispatchEvent = win.dispatchEvent || ((event) => {
  if (event && event.error) {
    console.error('WINDOW ERROR EVENT:', event.error.message)
    console.error(event.error.stack)
  }
})
win.addEventListener = win.addEventListener || (() => undefined)
win.removeEventListener = win.removeEventListener || (() => undefined)
