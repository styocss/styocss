# What is StyoCSS?

StyoCSS is an atomic CSS-in-JS engine. It allows you to write CSS in JavaScript, and it generates atomic CSS styles for you!

For example, you can write the following CSS-in-JS code:

> Structure:
> ```plain
> {
> 	[css-property]: [css-value],
> 	[selector]: {
> 		[css-property]: [css-value],
>
> 		[selector]: {
> 			[css-property]: [css-value],
> 		},
> 	},
> }
> ```

```ts
// 'a b'
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

And it will generate the following atomic CSS styles:

```css
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
