import {registerVariables} from '../core/variables.js';
import {hardware} from './hardware.js';
import {time} from './time.js';

export function registerBuiltinVariables() {
    registerVariables(hardware);
    registerVariables(time);
}
