/** @import { Effect, TemplateNode } from '#client' */
import { FILENAME, HMR } from '../../../constants.js';
import { EFFECT_TRANSPARENT, HMR_ANCHOR } from '#client/constants';
import { hydrate_node, hydrating } from '../dom/hydration.js';
import { block, branch, destroy_effect } from '../reactivity/effects.js';
import { set, source } from '../reactivity/sources.js';
import { set_should_intro } from '../render.js';
import { active_effect, get, untrack } from '../runtime.js';

/**
 * @template {(anchor: Comment, props: any) => any} Component
 * @param {Component} fn
 */
export function hmr(fn) {
	const current = source(fn);

	/**
	 * @param {TemplateNode} initial_anchor
	 * @param {any} props
	 */
	function wrapper(initial_anchor, props) {
		if (new.target) {
			// `new Component(...)` (legacy `componentApi: 4`) must return the real instance, as
			// `$set`/`$on`/`$destroy` live on its prototype and would not be copied onto `instance`
			// below. The compiled component hands the options to `createClassComponent`, which
			// mounts this wrapper as a function, so hot updates still work. Read `current` untracked
			// so that constructing a component inside an effect does not subscribe it to HMR updates.
			// @ts-expect-error
			return new (untrack(() => get(current)))(initial_anchor, props);
		}

		let component = {};
		let instance = {};

		/** @type {string[]} the keys of `instance` that were copied from the component */
		let copied = [];

		/** @type {Effect} */
		let effect;

		let ran = false;
		let anchor = initial_anchor;

		block(() => {
			if (component === (component = get(current))) {
				return;
			}

			if (effect) {
				// only remove what we copied: `createClassComponent` adds `$set` and `$destroy`
				// to the instance, and those have to survive updates
				// @ts-ignore
				for (const key of copied) delete instance[key];
				destroy_effect(effect);
			}

			effect = branch(() => {
				anchor = /** @type {any} */ (anchor)[HMR_ANCHOR] ?? anchor;

				// when the component is invalidated, replace it without transitions
				if (ran) set_should_intro(false);

				// @ts-expect-error
				var result = component(anchor, props);
				// a component is not guaranteed to return something and we can't invoke getOwnPropertyDescriptors on undefined
				if (result) {
					// preserve getters/setters
					Object.defineProperties(instance, Object.getOwnPropertyDescriptors(result));
					copied = Object.keys(result);
				}

				if (ran) set_should_intro(true);
			});

			// Forward the start/end DOM nodes from the inner effect to the outer active effect
			// which would get them if the HMR wrapper wasn't there. Do this inside the block not
			// outside so that HMR updates to the component will also update the nodes on the
			// active effect. We copy only start/end, not the full nodes object, so that
			// pause_children does not collect transitions from both effects and fire outroend twice.
			var inner_nodes = effect.nodes;
			if (inner_nodes) {
				var ae = /** @type {Effect} */ (active_effect);
				if (ae.nodes) {
					ae.nodes.start = inner_nodes.start;
					ae.nodes.end = inner_nodes.end;
				} else {
					ae.nodes = { start: inner_nodes.start, end: inner_nodes.end, a: null, t: null };
				}
			}
		}, EFFECT_TRANSPARENT);

		ran = true;

		if (hydrating) {
			anchor = hydrate_node;
		}

		return instance;
	}

	// @ts-expect-error
	wrapper[FILENAME] = fn[FILENAME];

	// @ts-ignore
	wrapper[HMR] = {
		fn,
		current,
		update: (/** @type {any} */ incoming) => {
			// This logic ensures that the first version of the component is the one
			// whose update function and therefore block effect is preserved across updates.
			// If we don't do this dance and instead just use `incoming` as the new component
			// and then update, we'll create an ever-growing stack of block effects.

			// Trigger the original block effect
			set(wrapper[HMR].current, incoming[HMR].fn);

			// Replace the incoming source with the original one
			incoming[HMR].current = wrapper[HMR].current;
		}
	};

	return wrapper;
}
