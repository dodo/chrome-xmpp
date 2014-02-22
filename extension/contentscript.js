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
        if (!pool[id])
             pool[id] = new Client(id);
    } else { // routing
        if (!pool[id]) return;
        if (!pool[id][ev.data.action]) return;

        return pool[id][ev.data.action].apply(pool[id], ev.data.args || {});
    }
});


//------------------------------------------------------------------------------


function Client(id) {
    this.id = id;
    this.port = chrome.runtime.connect({name:id});
    this.port.onMessage.addListener(this.messageListener.bind(this));
    this.port.onDisconnect.addListener(function () {
        delete pool[id];
    });
}

Client.prototype.connect = function connect() {
    this.port.postMessage({request:'permission'});
};

Client.prototype.end = function end() {
    this.port.postMessage({request:'detach'});
};

Client.prototype.messageListener = function messageListener(msg) {
    window.postMessage({
        method:msg.method,
        args:msg.args,
        type:'xmpp',
        id:this.id,
    }, '*');
};

