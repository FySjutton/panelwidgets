// Reads the parts/ and variables/ folders. Files only export what they have, the loader decides who wins
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {listJsFiles} from './config.js';
import {isPartClass} from './parts.js';

const LOG = '[panelwidgets]';
let cacheBustCounter = 0;

// Imports every .js file in the folder
async function importFolder(builtinDir, userDir, cacheBust) {
    const modules = [];
    for (const [dir, builtin] of [[builtinDir, true], [userDir, false]]) {
        for (const name of listJsFiles(dir)) {
            const path = GLib.build_filenamev([dir, name]);
            try {
                let uri = Gio.File.new_for_path(path).get_uri();
                if (cacheBust)
                    uri += `?t=${Date.now()}-${cacheBustCounter++}`;
                const module = await import(uri);
                modules.push({file: name.slice(0, -'.js'.length), path, builtin, module});
            } catch (e) {
                console.error(`${LOG} could not load ${path}: ${e.message}`);
            }
        }
    }
    return modules;
}

function resolve(candidates, overrides, kind) {
    const items = candidates.map(c => ({
        ...c,
        enabled: (overrides[c.name]?.enabled ?? true) !== false,
        active: false,
    }));

    const live = items
        .filter(c => c.enabled)
        .sort((a, b) => (a.priority - b.priority) || (b.builtin - a.builtin) || a.path.localeCompare(b.path));
    const winners = new Map();
    for (const candidate of live) {
        const previous = winners.get(candidate.name);
        if (previous)
            console.log(`${LOG} ${kind} "${candidate.name}": ${candidate.path} overrides ${previous.path}`);
        winners.set(candidate.name, candidate);
    }
    for (const winner of winners.values())
        winner.active = true;

    return {winners, items};
}

// Plain info about each candidate, without the code itself
const toInfo = items => items.map(({value: _value, ...info}) => info);

export async function loadVariables(builtinDir, userDir, overrides = {}, cacheBust = false) {
    const candidates = [];
    for (const {path, builtin, module} of await importFolder(builtinDir, userDir, cacheBust)) {
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
    const {winners, items} = resolve(candidates, overrides, 'variable');
    return {
        definitions: new Map([...winners].map(([name, {value}]) => [name, value])),
        items: toInfo(items),
    };
}

export async function loadParts(builtinDir, userDir, overrides = {}, cacheBust = false) {
    const candidates = [];
    for (const {file, path, builtin, module} of await importFolder(builtinDir, userDir, cacheBust)) {
        if (!isPartClass(module.default)) {
            console.error(`${LOG} ${path}: needs export default a class that extends Part`);
            continue;
        }
        const name = module.type ?? file;
        candidates.push({name, value: module.default, priority: module.priority ?? 0, builtin, path});
    }
    const {winners, items} = resolve(candidates, overrides, 'part');
    return {
        classes: new Map([...winners].map(([name, {value}]) => [name, value])),
        items: toInfo(items),
    };
}
