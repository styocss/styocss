import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
    // Theme tokens as CSS variables. `:root` holds the default (dark) theme;
    // `html.light` overrides it while the light theme is active.
    variables: {
      definitions: {
        ':root': {
          '--bg': { value: '#0f172a' },
          '--surface': { value: '#1e293b' },
          '--surface-hover': { value: 'rgb(148 163 184 / 0.12)' },
          '--border': { value: '#334155' },
          '--text': { value: '#e2e8f0' },
          '--text-muted': { value: '#94a3b8' },
          '--accent': { value: '#34d399' },
          '--accent-contrast': { value: '#052e16' },
          '--accent-soft': { value: 'rgb(52 211 153 / 0.12)' },
          '--switch-off': { value: 'rgb(148 163 184 / 0.35)' },
          '--ring': { value: 'rgb(52 211 153 / 0.4)' },
        },
        'html.light': {
          '--bg': { value: '#f1f5f9' },
          '--surface': { value: '#ffffff' },
          '--surface-hover': { value: 'rgb(15 23 42 / 0.06)' },
          '--border': { value: '#e2e8f0' },
          '--text': { value: '#0f172a' },
          '--text-muted': { value: '#64748b' },
          '--accent': { value: '#059669' },
          '--accent-contrast': { value: '#ecfdf5' },
          '--accent-soft': { value: 'rgb(5 150 105 / 0.1)' },
          '--switch-off': { value: '#cbd5e1' },
          '--ring': { value: 'rgb(5 150 105 / 0.35)' },
        },
      },
    },

    selectors: {
      definitions: [
        { name: '@light', value: 'html.light $' },
        { name: '@sm', value: '@media (min-width: 640px)' },
      ],
    },

    keyframes: {
      definitions: [
        {
          name: 'pop-in',
          frames: {
            from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
            to: { opacity: '1', transform: 'translateY(0) scale(1)' },
          },
        },
        {
          name: 'pulse-ring',
          frames: {
            '0%': { boxShadow: '0 0 0 0 var(--ring)' },
            '70%': { boxShadow: '0 0 0 6px transparent' },
            '100%': { boxShadow: '0 0 0 0 transparent' },
          },
        },
      ],
    },

    // Shortcut composition is represented by ordinary style-item arrays.
    shortcuts: {
      definitions: [
        {
          name: 'card',
          value: {
            'width': '100%',
            'maxWidth': '22.5rem',
            'padding': '1.5rem',
            'borderRadius': '1rem',
            'border': '1px solid var(--border)',
            'backgroundColor': 'var(--surface)',
            'boxShadow': '0 1px 2px rgb(0 0 0 / 0.4)',
            'transition': 'background-color 0.3s ease, border-color 0.3s ease',
            '@light': { boxShadow: '0 12px 32px rgb(15 23 42 / 0.1)' },
          },
        },
        {
          name: 'chip',
          value: {
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0.125rem 0.5rem',
            borderRadius: '9999px',
            fontSize: '0.6875rem',
            fontWeight: '700',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
            backgroundColor: 'var(--accent-soft)',
            border: '1px solid var(--accent)',
          },
        },
        {
          name: 'switch-track',
          value: {
            'position': 'relative',
            'flexShrink': '0',
            'width': '2.5rem',
            'height': '1.5rem',
            'borderRadius': '9999px',
            'border': 'none',
            'padding': '0',
            'cursor': 'pointer',
            'transition': 'background-color 0.2s ease',
            '$:focus-visible': { outline: '2px solid var(--accent)', outlineOffset: '2px' },
            '$::before': {
              content: '""',
              position: 'absolute',
              top: '50%',
              left: '0.1875rem',
              width: '1.125rem',
              height: '1.125rem',
              borderRadius: '9999px',
              backgroundColor: '#ffffff',
              boxShadow: '0 1px 2px rgb(0 0 0 / 0.35)',
              transition: 'transform 0.2s ease',
            },
          },
        },
        {
          name: 'btn',
          value: {
            'display': 'inline-flex',
            'alignItems': 'center',
            'justifyContent': 'center',
            'gap': '0.375rem',
            'padding': '0.5rem 1rem',
            'borderRadius': '0.5rem',
            'border': '1px solid transparent',
            'fontSize': '0.875rem',
            'fontWeight': '600',
            'fontFamily': 'inherit',
            'cursor': 'pointer',
            'transition': 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.1s ease, filter 0.2s ease',
            '$:focus-visible': { outline: '2px solid var(--accent)', outlineOffset: '2px' },
            '$:active': { transform: 'scale(0.97)' },
          },
        },
        {
          name: 'btn-primary',
          value: ['btn', {
            'backgroundColor': 'var(--accent)',
            'color': 'var(--accent-contrast)',
            '$:hover': { filter: 'brightness(1.08)' },
          }],
        },
        {
          name: 'btn-ghost',
          value: ['btn', {
            'backgroundColor': 'transparent',
            'borderColor': 'var(--border)',
            'color': 'var(--text)',
            '$:hover': { backgroundColor: 'var(--surface-hover)' },
          }],
        },
      ],
    },
  },
})
