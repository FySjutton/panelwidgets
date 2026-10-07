import St from 'gi://St';

import {Part} from '../core/parts.js';
import {render} from '../core/variables.js';

export class TextPart extends Part {
    build() {
        this.template = this.options.text ?? '';
        this.label = new St.Label({
            style_class: ['pw-text', this.options.style].filter(Boolean).join(' '),
        });
        return this.label;
    }

    update() {
        this.label.text = render(this.template);
    }
}
