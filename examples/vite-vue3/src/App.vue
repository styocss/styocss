<script setup lang="ts">
function toggleDarkMode() {
	document.documentElement.classList.toggle('dark')
}

const styles = {
	title: styo({
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
	button: styo({
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
	buttonIcon: styo(
		'i-line-md:sunny-filled-loop',
		{ '@dark': ['i-line-md:moon-filled-loop'] },
	),
}
</script>

<template>
	<main
		:class="styo('main')"
	>
		<div
			:class="styo({
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				gap: '12px',
			})"
		>
			<h1 :class="styles.title">
				StyoCSS
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
			:class="styo({
				position: 'fixed',
				top: '2rem',
				right: '2rem',
				fontSize: '3rem',
				backgroundColor: '#333',
				transform: 'translate(50%, -50%) rotate(45deg)',
				padding: '2rem 10rem 1rem 10rem',
				cursor: 'pointer',
			})"
			href="https://github.com/styocss/styocss"
			target="_blank"
			rel="noopener noreferrer"
		>
			<div
				:class="styo('i-line-md:github', {
					fontSize: '3rem',
					color: 'white',
				})"
			/>
		</a>
	</main>
</template>
