// Applies the saved theme before the first paint (see src/lib/theme.ts).
// Loaded as a blocking script from index.html rather than inlined, so the
// server's Content-Security-Policy (script-src 'self') allows it.
try {
  var theme = localStorage.getItem('helpdesk-theme')
  if (theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark')
  }
} catch (e) {}
