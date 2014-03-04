/*
 * This script just pipes events from a (injectxmpp) connection
 * fron tab.window to a chrome message port on the background page.
 */

var NS = 'chrome-xmpp';
var pool = {};

var script = document.createElement('script');
script.setAttribute('type', "text/javascript");
script.setAttribute('src', chrome.extension.getURL("injectxmpp.js"));
document.addEventListener('DOMContentLoaded', function () {
    document.body.appendChild(script);
});

window.addEventListener('message', function (ev) {
    if (ev.source !== window) return;
    var id = ev && ev.data && ev.data.type == 'xmpp' && ev.data.id;
    if (id && ev.data.action === 'init') {
        // pipe all events througth from message port to window in both directions
        fullduplexPipe(id, window, chrome.runtime.connect({name:id}));
    }
});

// helper functions

function fullduplexPipe(id, source, target, origin) {
    origin = origin || '*';
    pass(id, source, target, origin);
    pass(id, target, source, origin);
}

function pass(id, source, target, origin) {
    if (source.addEventListener) {
        source.addEventListener('message', function (ev) {
            if (validate(ev.data, id)) {
                ev.data._proxied = true;
                target.postMessage(ev.data);
            }
        });
    } else {
        source.onMessage.addListener(function (ev) {
            if (validate(ev, id)) {
                ev._proxied = true;
                target.postMessage(ev, origin);
            }
        });
    }
}

function validate(ev, id) {
    return (ev && ev.ns === NS && ev.id === id && !ev._proxied);
}

