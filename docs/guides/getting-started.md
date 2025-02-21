---
title: Getting Started
description: Get started with StyoCSS.
outline: deep
---

# What is StyoCSS?

StyoCSS is an atomic CSS-in-JS engine. It allows you to write CSS in JavaScript, and it generates atomic CSS styles for you!

For the most simple case, you can write the following CSS-in-JS code:

::: code-group

```ts [input.ts]
const styles: string = styo({
	'color': '#333',

	// && is a placeholder for the current selector
	'&&:hover': {
		color: 'blue',
	},

	'@media (prefers-color-scheme: dark)': {
		'color': '#eee',

		'&&:hover': {
			color: 'lightblue',
		},
	},
})
```

```ts [output.ts]
const styles: string = 'a b c d'
```

```css [styles.css]
.a {
    color: #333;
}
.b:hover {
    color: blue;
}
@media (prefers-color-scheme: dark) {
	.c {
		color: #eee;
	}
	.d:hover {
		color: lightblue;
	}
}
```

:::
