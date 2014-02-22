// FIXME
var CONFIG = {
    plugins:['Disco', 'Presence', 'Ping'],
}, PARAMS = {
    host:'127.0.0.1',
    preferred:'PLAIN',
};

//------------------------------------------------------------------------------

var bgapp, bgappid, actions = {}, pool = {};
chrome.management.getAll(function (apps) {
    if(apps.some(function (app) {
        if(app.type !== 'packaged_app') return;
        if(app.name !== "XMPP") return;
        bgappid = app.id;
        return true;
    })) {

        if (localStorage['jid'] && localStorage['pw']) {
            // autostart
            chrome.management.launchApp(bgappid, function () {

                bgapp = chrome.runtime.connect(bgappid);

                bgapp.onMessage.addListener(function (msg) {
                    if (!msg) return;
                    if (!msg.id) return;
                    if (!msg.action) return;
                    if (!pool[msg.id]) return;
                    if (!pool[msg.id][msg.action]) return;

                    pool[msg.id][msg.action].call(pool[msg.id], msg);
                });
            });
        }

    };
});

chrome.extension.onRequest.addListener(function (request, sender, sendResponse) {
    var action = function () {return {error:request.type + " not an action"}};
    if (actions[request.type])
        action = actions[request.type];
    sendResponse(action(request, sender));
});

chrome.runtime.onConnect.addListener(function (port) {
    console.assert(port.name);
    pool[port.name] = new Client(port);
    port.onDisconnect.addListener(function () {
        delete pool[port.name];
    })
});

function getAppID() {
    return bgappid;
}

//------------------------------------------------------------------------------

actions.allow = function (request, sender) {
    if (!request.id) return;
    if (!pool[request.id]) return;

    return pool[request.id].allow();
}

actions.deny = function (request, sender) {
    if (!request.id) return;
    if (!pool[request.id]) return;

    return pool[request.id].deny();
}

//------------------------------------------------------------------------------

function Client(port) {
    this.port = port;
    this.id = port.name;

    this.port.onMessage.addListener(this.messageListener.bind(this));
}

Client.prototype.allow = function allow() {
    this.port.postMessage({method:'onevent', args:['allowed']})
    this.attach()
};

Client.prototype.deny = function deny() {
    this.port.postMessage({method:'onerror', args:['access denied']})
};

Client.prototype.attach = function attach() {
    var passwd = localStorage['pw'];
    this.jid = localStorage['jid'];
    bgapp.postMessage({
        action: 'attach',
        jid:this.jid,
        id: this.id,
        pw: passwd,
        params:PARAMS,
        cfg:CONFIG,
    });
};

Client.prototype.onevent = function (ev) {
    this.port.postMessage({method:'onevent', args:ev.args});
};

Client.prototype.messageListener = function messageListener(msg) {
    if (!msg) return;
    if (!msg.request) return;
    if (!this['request_' + msg.request]) return;

    this['request_' + msg.request].call(this, msg);
};

Client.prototype.request_permission = function request_permission() {
    chrome.infobars.show({
        path: "infobar.html#"+this.id,
        tabId: this.port.sender.tab.id,
    });
};

Client.prototype.request_detach = function request_detach() {
    bgapp.postMessage({
        action: 'detach',
        jid:this.jid,
        id: this.id,
    });

};



