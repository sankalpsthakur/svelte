import { flushSync } from 'svelte';
import { HMR } from 'svelte/internal/client';
import { test } from '../../test';

export default test({
	compileOptions: {
		dev: true,
		hmr: true,
		compatibility: {
			componentApi: 4
		}
	},

	html: '<button>v1 0</button>',

	async test({ assert, target, mod }) {
		// with HMR enabled, `mod.default` is the HMR wrapper
		const div = document.createElement('div');
		const component = new mod.default({ target: div, props: { count: 1 } });
		assert.htmlEqual(div.innerHTML, '<button>v1 1</button>');

		/** @type {string[]} */
		const events = [];
		component.$on('close', (/** @type {CustomEvent} */ e) => events.push(e.type));

		div.querySelector('button')?.click();
		flushSync();
		assert.deepEqual(events, ['close']);

		component.$set({ count: 2 });
		flushSync();
		assert.htmlEqual(div.innerHTML, '<button>v1 2</button>');

		// simulate a hot update of the component module
		const hidden = './_output/client/other' + '.svelte.js';
		const other = await import(/* vite-ignore */ hidden);
		mod.default[HMR].update(other.default);
		flushSync();

		assert.htmlEqual(target.innerHTML, '<button>v2 0</button>');
		assert.htmlEqual(div.innerHTML, '<button>v2 2</button>');

		// the instance methods keep working after the update
		div.querySelector('button')?.click();
		flushSync();
		assert.deepEqual(events, ['close', 'close']);

		component.$set({ count: 3 });
		flushSync();
		assert.htmlEqual(div.innerHTML, '<button>v2 3</button>');

		// a second update, back to the original version
		mod.default[HMR].update(mod.default);
		flushSync();

		assert.htmlEqual(target.innerHTML, '<button>v1 0</button>');
		assert.htmlEqual(div.innerHTML, '<button>v1 3</button>');

		component.$destroy();
		assert.htmlEqual(div.innerHTML, '');
	}
});
