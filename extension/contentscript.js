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
    if (ev.data.type !== 'xmpp') return;
    if (!ev.data.action) return;
    if (!ev.data.id) return;
    var id = ev.data.id;
    if (ev.data.action === 'init') {
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
            if (validate(ev.data, id))
                target.postMessage(ev.data, origin);
        });
    } else {
        source.onMessage.addListener(function (ev) {
            if (validate(ev, id))
                target.postMessage(ev);
        });
    }
};

function validate(ev, id) {
    return (ev && ev.ns === NS && ev.id === id);
}

