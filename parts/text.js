import St from 'gi://St';

import {Part} from '../core/parts.js';

// text is either a fixed string or a function that gives the text on every update
export default class TextPart extends Part {
    build() {
        this.label = new St.Label({
            style_class: ['pw-text', this.options.style].filter(Boolean).join(' '),
        });
        return this.label;
    }

    update() {
        const {text} = this.options;
        this.label.text = String((typeof text === 'function' ? text() : text) ?? '');
    }
}
