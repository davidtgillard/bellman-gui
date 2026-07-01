// Injected into the page (via Playwright addInitScript) before the app loads.
// Substitutes the Tauri IPC boundary with an in-memory fake backend so the
// real React frontend can run in Chromium. Mirrors the internals used by
// `@tauri-apps/api/mocks` (invoke, transformCallback, runCallback, callbacks)
// with event mocking enabled.
(() => {
  const internals = (window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {});

  const callbacks = new Map();
  const listeners = new Map();
  const calls = [];

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function registerCallback(callback, once = false) {
    const id = window.crypto.getRandomValues(new Uint32Array(1))[0];
    callbacks.set(id, (data) => {
      if (once) {
        callbacks.delete(id);
      }
      return callback && callback(data);
    });
    return id;
  }

  function unregisterCallback(id) {
    callbacks.delete(id);
  }

  function runCallback(id, data) {
    const callback = callbacks.get(id);
    if (callback) {
      callback(data);
    }
  }

  const scenario = window.__TEST_SCENARIO__ || {};

  function defaultState() {
    return {
      root: "/roadmap",
      editable: true,
      nodes: [],
      links: [],
      link_types: [],
      label: null,
    };
  }

  const states =
    scenario.states && scenario.states.length
      ? scenario.states.map(clone)
      : [defaultState()];
  let index = typeof scenario.index === "number" ? scenario.index : states.length - 1;

  function currentGraph() {
    const state = states[index];
    return {
      root: state.root,
      editable: state.editable,
      nodes: clone(state.nodes),
      links: clone(state.links),
      link_types: clone(state.link_types || []),
    };
  }

  function undoStatus() {
    const canUndo = index > 0;
    const canRedo = index < states.length - 1;
    return {
      can_undo: canUndo,
      can_redo: canRedo,
      undo_label: canUndo ? states[index].label ?? null : null,
      redo_label: canRedo ? states[index + 1].label ?? null : null,
    };
  }

  function pushState(next) {
    states.splice(index + 1);
    states.push(clone(next));
    index = states.length - 1;
  }

  function fakeInvoke(cmd, args) {
    const request = args && args.request ? args.request : {};
    switch (cmd) {
      case "load_initial_roadmap":
      case "pick_and_load_roadmap":
      case "load_roadmap_graph_command":
        return currentGraph();
      case "undo_command":
        if (index > 0) {
          index -= 1;
        }
        return currentGraph();
      case "redo_command":
        if (index < states.length - 1) {
          index += 1;
        }
        return currentGraph();
      case "undo_state_command":
        return undoStatus();
      case "create_node_command": {
        const next = clone(states[index]);
        const kind = request.node_kind || "goal";
        const name = request.name || "new-node";
        next.nodes.push({ id: `${kind}--${name}`, type: kind });
        next.label = `create ${kind} ${name}`;
        pushState(next);
        return currentGraph();
      }
      case "create_link_command": {
        const next = clone(states[index]);
        next.links.push({
          id: `${request.link_type}--${request.source}--${request.target}`,
          link_type: request.link_type,
          source: request.source,
          target: request.target,
        });
        next.label = `create link ${request.link_type}`;
        pushState(next);
        return currentGraph();
      }
      case "remove_link_command": {
        const next = clone(states[index]);
        next.links = next.links.filter((link) => link.id !== request.link_id);
        next.label = "remove link";
        pushState(next);
        return currentGraph();
      }
      case "remove_node_command": {
        const next = clone(states[index]);
        next.nodes = next.nodes.filter((node) => node.id !== request.node_id);
        next.label = "remove node";
        pushState(next);
        return currentGraph();
      }
      case "load_node_detail_command":
        return scenario.nodeDetail || null;
      case "load_work_package_layout_command":
      case "save_work_package_node_position_command":
      case "remove_work_package_node_position_command":
      case "save_graph_layout_command":
      case "save_top_level_node_position_command":
      case "remove_top_level_node_position_command":
        return (
          scenario.layout || {
            version: 1,
            kind: "bellman-gui-work-package-layout",
            top_level: {},
            projects: {},
          }
        );
      case "load_settings_command": {
        const liveScenario = window.__TEST_SCENARIO__ || {};
        return (
          liveScenario.settings || {
            max_pan_speed: 960,
          }
        );
      }
      case "bellman_version":
        return "test";
      default:
        return null;
    }
  }

  function invoke(cmd, args) {
    calls.push({ cmd, args: clone(args) });

    if (cmd === "plugin:event|listen") {
      const list = listeners.get(args.event) || [];
      list.push(args.handler);
      listeners.set(args.event, list);
      return Promise.resolve(args.handler);
    }
    if (cmd === "plugin:event|unlisten") {
      const list = listeners.get(args.event);
      if (list) {
        const position = list.indexOf(args.eventId);
        if (position !== -1) {
          list.splice(position, 1);
        }
      }
      return Promise.resolve(null);
    }
    if (cmd === "plugin:event|emit" || cmd === "plugin:event|emit_to") {
      const list = listeners.get(args.event) || [];
      for (const handler of list) {
        runCallback(handler, args);
      }
      return Promise.resolve(null);
    }
    if (cmd.startsWith("plugin:")) {
      return Promise.resolve(null);
    }

    return Promise.resolve(fakeInvoke(cmd, args));
  }

  internals.invoke = invoke;
  internals.transformCallback = registerCallback;
  internals.unregisterCallback = unregisterCallback;
  internals.runCallback = runCallback;
  internals.callbacks = callbacks;

  window.__TEST__ = {
    calls,
    reset() {
      calls.length = 0;
    },
    status() {
      return undoStatus();
    },
    emit(event, payload) {
      const list = listeners.get(event) || [];
      for (const handler of list) {
        runCallback(handler, { event, id: 0, payload: payload ?? null });
      }
    },
  };
})();
