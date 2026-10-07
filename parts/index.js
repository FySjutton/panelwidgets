import {registerPart} from '../core/parts.js';
import {TextPart} from './text.js';

export function registerBuiltinParts() {
    registerPart('text', TextPart);
}
