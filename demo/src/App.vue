<script setup lang="ts">
function toggleDarkMode() {
	document.documentElement.querySelector('link[rel="icon"]')
		?.setAttribute(
			'href',
			document.documentElement.classList.contains('dark') ? '/logo-black.svg' : '/logo-white.svg',
		)
	document.documentElement.classList.toggle('dark')
}
</script>

<template>
	<main
		:class="pika('main')"
	>
		<a
			:class="pika({
				position: 'fixed',
				top: '2rem',
				right: '2rem',
				fontSize: '3rem',
				backgroundColor: '#333',
				transform: 'translate(50%, -50%) rotate(45deg)',
				padding: '2rem 10rem 1rem 10rem',
				cursor: 'pointer',
			})"
			href="https://github.com/pikacss/pikacss"
			target="_blank"
			rel="noopener noreferrer"
		>
			<div
				:class="pika(
					'i-line-md:github',
					{
						fontSize: '3rem',
						color: 'white',
					})"
			/>
		</a>

		<div
			:class="pika({
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				gap: '12px',
			})"
		>
			<h1
				:class="pika({
					'margin': '0',
					'fontSize': '4rem',
					'@screen-md': {
						fontSize: '4.5rem',
					},
					'@screen-lg': {
						fontSize: '5rem',
					},
					'@screen-xl': {
						fontSize: '5.5rem',
					},
					'@screen-xxl': {
						fontSize: '6rem',
					},
				})"
			>
				PikaCSS
			</h1>

			<div :class="pika({ width: '50dvw', minWidth: '300px', maxWidth: '400px' })">
				<img
					:class="pika({ '@light': { display: 'none' } })"
					src="/logo-white.svg"
					alt="Logo"
				>
				<img
					:class="pika({ '@dark': { display: 'none' } })"
					src="/logo-black.svg"
					alt="Logo"
				>
			</div>

			<button
				:class="pika({
					'display': 'flex',
					'alignItems': 'center',
					'gap': '0.5em',
					'padding': '0.5em 1em',
					'borderRadius': '0.25em',
					'border': 'none',
					'backgroundColor': 'var(--color-primary)',
					'color': 'white',
					'cursor': 'pointer',
					'transition': 'transform 0.2s ease',
					'fontSize': '1.25rem',

					':hover': {
						transform: 'scale(1.05)',
					},

					':active': {
						transform: 'scale(0.95)',
					},

					'@screen-md': {
						fontSize: '1.5rem',
					},
					'@screen-lg': {
						fontSize: '1.75rem',
					},
					'@screen-xl': {
						fontSize: '2rem',
					},
					'@screen-xxl': {
						fontSize: '2rem',
					},
				})"
				@click="toggleDarkMode"
			>
				<div
					:class="pika(
						'i-line-md:sunny-filled-loop',
						{ '@dark': ['i-line-md:moon-filled-loop'] },
					)"
				/>
				Toggle
			</button>
		</div>
	</main>
</template>
