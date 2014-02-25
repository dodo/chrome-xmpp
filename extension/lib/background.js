// FIXME
var CONFIG = {
    plugins:['Disco', 'Presence', 'Ping'],
}, PARAMS = {
    host:'127.0.0.1',
    preferred:'PLAIN',
};

//------------------------------------------------------------------------------
var util = require('util');
var Connection = require('../../lib/connection');

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

// for infobar
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
    Connection.call(this, {
        target:bgapp,
        id:port.name,
    }).listen(port);
    this.on('request permission', this.request_permission.bind(this));
}
util.inherits(Client, Connection);

Client.prototype.allow = function allow() {
    this.sendToTarget('allow', 'allowed');
    this.attach();
};

Client.prototype.deny = function deny() {
    this.sendToTarget('error', 'access denied');
};

Client.prototype.attach = function attach() {
    var passwd = localStorage['pw'];
    this.jid = localStorage['jid'];
    this.send('attach', {
        jid:this.jid,
        pw: passwd,
        params:PARAMS,
        cfg:CONFIG,
    });
};



