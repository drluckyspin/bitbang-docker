// go-remote compat: loaded by go-remote-ingress at the top of herdr-web-ui's page, inside BitBang's iframe on bitba.ng.
(() => {
  "use strict";

  // BitBang's xhr-shim, which runs before this script, strips its /__device__/<session> prefix from the
  // address and drops the query with it, so the pairing code and the pane in a scanned link would never
  // reach the app. The navigation entry still holds the address the frame was loaded with.
  const [navigation] = performance.getEntriesByType("navigation");
  if (navigation && location.search === "") {
    try {
      const loaded = new URL(navigation.name);
      if (loaded.search !== "" && loaded.pathname.startsWith("/__device__/")) {
        history.replaceState(history.state, "", location.pathname + loaded.search + location.hash);
      }
    } catch {
      // an unreadable entry leaves the address as BitBang set it
    }
  }

  // herdr-web-ui sizes its shell to window.visualViewport, which is how it keeps the key bar and the prompt above a
  // phone's keyboard. iOS shrinks the visual viewport of the top-level page only, so inside BitBang's frame the
  // app saw a full-height screen and left the last lines under the keyboard. The frame is same-origin with
  // bitba.ng, so the app is given the parent's viewport, which does shrink. This runs before the app's own scripts.
  try {
    const outer = window.parent !== window ? window.parent.visualViewport : null;
    if (outer) Object.defineProperty(window, "visualViewport", { configurable: true, get: () => outer });
  } catch {
    // a parent that cannot be read leaves the app with its own viewport
  }

  const MUTATING = /^(?:POST|PUT|PATCH|DELETE)$/i;

  function sameOrigin(url) {
    try {
      return new URL(url, location.href).origin === location.origin;
    } catch {
      return false;
    }
  }

  // herdr-web-ui accepts a state-changing request without an Origin header only when it carries
  // x-herdr-machine. BitBang's proxy never forwards Origin, so the app's own requests say so here.
  // CSRF protection holds: another site cannot add a custom header to a request it sends here.
  const nativeFetch = window.fetch;
  window.fetch = function fetch(input, init) {
    const request = input instanceof Request ? input : null;
    const method = (init && init.method) || (request ? request.method : "GET");
    const url = request ? request.url : String(input);
    if (MUTATING.test(method) && sameOrigin(url)) {
      const headers = new Headers((init && init.headers) || (request ? request.headers : undefined));
      headers.set("x-herdr-machine", "1");
      init = Object.assign({}, init, { headers });
    }
    return nativeFetch.call(window, input, init);
  };

  const xhr = XMLHttpRequest.prototype;
  const nativeOpen = xhr.open;
  const nativeSend = xhr.send;
  xhr.open = function open(method, url, ...rest) {
    this.__goRemoteMutating = MUTATING.test(String(method)) && sameOrigin(String(url));
    return nativeOpen.call(this, method, url, ...rest);
  };
  xhr.send = function send(body) {
    if (this.__goRemoteMutating) {
      try {
        this.setRequestHeader("x-herdr-machine", "1");
      } catch {
        // the request was not opened; send reports that itself
      }
    }
    return nativeSend.call(this, body);
  };

  // The frame is same-origin with bitba.ng and controlled by BitBang's service worker. The app's own
  // registration (/sw.js, scope /) and push subscription would land on BitBang's, so both fail here
  // the way they do in a browser without service workers. Alerts come from ntfy instead.
  if ("serviceWorker" in navigator) {
    const container = navigator.serviceWorker;
    const unavailable = () => Promise.reject(new DOMException("Service workers are unavailable over BitBang", "SecurityError"));
    const define = (name, descriptor) => {
      try {
        Object.defineProperty(container, name, Object.assign({ configurable: true }, descriptor));
      } catch {
        // a browser that refuses leaves the app to its own error handling
      }
    };
    define("register", { value: unavailable });
    define("getRegistration", { value: () => Promise.resolve(undefined) });
    define("getRegistrations", { value: () => Promise.resolve([]) });
    define("ready", { get: () => new Promise(() => {}) });
  }
  try {
    delete window.PushManager;
  } catch {
    // not configurable here; push still fails at registration
  }

  // iOS zooms into a focused field whose text is under 16px, and only the parent page could stop it.
  const style = document.createElement("style");
  style.textContent = "@media (pointer: coarse) { input, textarea, select { font-size: max(16px, 1em) !important; } }";
  (document.head || document.documentElement).appendChild(style);
})();
