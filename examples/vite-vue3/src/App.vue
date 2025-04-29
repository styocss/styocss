<script setup lang="ts">
function toggleDarkMode() {
	document.documentElement.querySelector('link[rel="icon"]')?.setAttribute(
		'href',
		document.documentElement.classList.contains('dark') ? '/logo-black.svg' : '/logo-white.svg',
	)
	document.documentElement.classList.toggle('dark')
}

const styles = {
	title: pika({
		'margin': 0,
		'@screen-xs': {
			fontSize: '3rem',
		},
		'@screen-sm': {
			fontSize: '4rem',
		},
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
	}),
	button: pika({
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
		'fontSize': '2rem',

		':hover': {
			transform: 'scale(1.05)',
		},

		':active': {
			transform: 'scale(0.95)',
		},
	}),
	buttonIcon: pika(
		'i-line-md:sunny-filled-loop',
		{ '@dark': ['i-line-md:moon-filled-loop'] },
	),
}
</script>

<template>
	<main
		:class="pika('main')"
	>
		<div
			:class="pika({
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				gap: '12px',
			})"
		>
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

			<h1 :class="styles.title">
				PikaCSS
			</h1>

			<button
				:class="styles.button"
				@click="toggleDarkMode"
			>
				<div
					:class="styles.buttonIcon"
				/>
				Toggle
			</button>
		</div>

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
				:class="pikap(
					'i-line-md:github',
					{
						fontSize: '3rem',
						color: 'white',
					})"
			/>
		</a>
	</main>
</template>
