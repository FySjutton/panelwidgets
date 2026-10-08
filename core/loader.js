// Reads the parts/ and variables/ folders. Files only export what they have, the loader decides who wins
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {listJsFiles} from './config.js';
import {isPartClass} from './parts.js';

const LOG = '[panelwidgets]';

// Imports every .js file, builtin folder first and then the user's
async function importFolder(builtinDir, userDir) {
    const modules = [];
    for (const [dir, builtin] of [[builtinDir, true], [userDir, false]]) {
        for (const name of listJsFiles(dir)) {
            const path = GLib.build_filenamev([dir, name]);
            try {
                const module = await import(Gio.File.new_for_path(path).get_uri());
                modules.push({file: name.slice(0, -'.js'.length), path, builtin, module});
            } catch (e) {
                console.error(`${LOG} could not load ${path}: ${e.message}`);
            }
        }
    }
    return modules;
}

// Highest priority wins, on equal priority the user's folder beats builtin and then the file name decides
function pickWinners(candidates, kind) {
    candidates.sort((a, b) =>
        (a.priority - b.priority) || (b.builtin - a.builtin) || a.path.localeCompare(b.path));
    const winners = new Map();
    for (const candidate of candidates) {
        const previous = winners.get(candidate.name);
        if (previous)
            console.log(`${LOG} ${kind} "${candidate.name}": ${candidate.path} overrides ${previous.path}`);
        winners.set(candidate.name, candidate);
    }
    return new Map([...winners].map(([name, {value}]) => [name, value]));
}

// A file exports default {name: {interval, update(), reset()}, ...} and optionally a priority for all of them.
// update() returns the value and may be async
export async function loadVariables(builtinDir, userDir) {
    const candidates = [];
    for (const {path, builtin, module} of await importFolder(builtinDir, userDir)) {
        if (typeof module.default !== 'object' || module.default === null) {
            console.error(`${LOG} ${path}: needs export default {name: {...}}`);
            continue;
        }
        for (const [name, definition] of Object.entries(module.default)) {
            if (typeof definition?.update !== 'function') {
                console.error(`${LOG} ${path}: variable "${name}" needs an update() function`);
                continue;
            }
            const priority = definition.priority ?? module.priority ?? 0;
            candidates.push({name, value: definition, priority, builtin, path});
        }
    }
    return pickWinners(candidates, 'variable');
}

// A file exports default a Part class, the type is the file name unless it exports type
export async function loadParts(builtinDir, userDir) {
    const candidates = [];
    for (const {file, path, builtin, module} of await importFolder(builtinDir, userDir)) {
        if (!isPartClass(module.default)) {
            console.error(`${LOG} ${path}: needs export default a class that extends Part`);
            continue;
        }
        const name = module.type ?? file;
        candidates.push({name, value: module.default, priority: module.priority ?? 0, builtin, path});
    }
    return pickWinners(candidates, 'part');
}
