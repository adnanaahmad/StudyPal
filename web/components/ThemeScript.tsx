"use client";

/**
 * ThemeScript - Initializes theme from localStorage before React hydration
 * This prevents the flash of wrong theme on page load
 */
export default function ThemeScript() {
  const themeScript = `
    (function() {
      try {
        const stored = localStorage.getItem('deeptutor-theme');

        if (stored === 'dark') {
          document.documentElement.classList.add('dark');
        } else if (stored === 'light') {
          document.documentElement.classList.remove('dark');
        } else {
          // Use system preference if not set, default to dark theme
          if (window.matchMedia('(prefers-color-scheme: light)').matches) {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('deeptutor-theme', 'light');
          } else {
            document.documentElement.classList.add('dark');
            localStorage.setItem('deeptutor-theme', 'dark');
          }
        }
      } catch (e) {
        // Silently fail - localStorage may be disabled
      }
    })();
  `;

  return (
    <script
      dangerouslySetInnerHTML={{ __html: themeScript }}
      suppressHydrationWarning
    />
  );
}
