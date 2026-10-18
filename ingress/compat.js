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

  // herdr-web-ui's About page names only itself. go-remote puts its own card first and gives the app the credit
  // below it. Only new nodes are added (and one heading restyled in CSS), because React owns the page's own and
  // would drop an edit on its next render. The ingress fills in the version when it serves this script.
  const VERSION = "__GO_REMOTE_VERSION__";
  const REPO = "https://github.com/drluckyspin/go-remote";

  function aboutRow(label, detail, href, text) {
    const row = document.createElement("div");
    row.className = "settings-row";
    const copy = document.createElement("div");
    copy.className = "settings-row-text";
    const name = document.createElement("span");
    name.className = "settings-label";
    name.textContent = label;
    copy.appendChild(name);
    if (detail) {
      const note = document.createElement("span");
      note.className = "settings-description";
      note.textContent = detail;
      copy.appendChild(note);
    }
    if (href) {
      const link = document.createElement("a");
      link.className = "settings-link";
      link.href = href;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = text;
      copy.appendChild(link);
    }
    row.appendChild(copy);
    return row;
  }

  function decorateAbout(herdrAbout) {
    herdrAbout.dataset.goRemote = "";
    const first = herdrAbout.parentElement && herdrAbout.parentElement.querySelector(".settings-section");
    if (!first) return;
    const section = document.createElement("section");
    section.className = "settings-section go-remote-about";
    const title = document.createElement("h3");
    title.textContent = "Go Remote";
    const card = document.createElement("div");
    card.className = "settings-card";
    const version = /^\d/.test(VERSION) ? VERSION : "development build";
    card.appendChild(aboutRow("Go Remote", "Your coding agent, on your phone. Version " + version + ".", REPO, "github.com/drluckyspin/go-remote"));
    card.appendChild(
      aboutRow(
        "Built with",
        "go-remote puts this page, herdr, and BitBang's encrypted peer-to-peer link together in a locked-down container. The terminal and chat view are herdr web ui by devswha, on top of herdr by herdrdev, and BitBang by Rich Legrand carries it to your phone. Thank you to all three.",
      ),
    );
    section.append(title, card);
    first.before(section);
  }

  // The app's own About card now sits below ours, so its heading says what it is.
  const aboutStyle = document.createElement("style");
  aboutStyle.textContent =
    ".settings-about[data-go-remote] > h3 { font-size: 0; } .settings-about[data-go-remote] > h3::after { content: 'Built on herdr web ui'; font-size: 1rem; }";
  (document.head || document.documentElement).appendChild(aboutStyle);

  new MutationObserver(() => {
    const herdrAbout = document.querySelector(".settings-about:not([data-go-remote])");
    if (herdrAbout) decorateAbout(herdrAbout);
  }).observe(document.documentElement, { childList: true, subtree: true });

  // iOS zooms into a focused field whose text is under 16px, and only the parent page could stop it.
  const style = document.createElement("style");
  style.textContent = "@media (pointer: coarse) { input, textarea, select { font-size: max(16px, 1em) !important; } }";
  (document.head || document.documentElement).appendChild(style);
})();
