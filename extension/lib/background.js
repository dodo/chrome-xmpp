/*
 * This script greps for background app,
 * starts infobar on connection apptempt from tab,
 * handles account configs,
 * …
 */
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

                bgapp = new Connection();
                bgapp.id = null; // allow all ids
                bgapp.on('error', console.error.bind(console));
                bgapp.listen(chrome.runtime.connect(bgappid), {name:bgapp.id});
//                 bgapp.on('foobar', function (foo, bar) {
//                    console.log(foo, bar);
//                 });
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
    var client = new Client(port);
    pool[client.id] = client;
    port.onDisconnect.addListener(function () {
        client.removeAllListeners();
        delete pool[client.id];
    });
});

function getAppID() {
    return bgappid;
}

/*------------------------------------------------------------------------------
 * infobar callbacks
 */

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

Client.EVENTS = ['call','listen'];

util.inherits(Client, Connection);
function Client(port) {
    Connection.call(this, {
        target:bgapp.source,
        id:port.name,
    }).listen(port);
    port.name = this.id;
    this.setupListeners();
}

Client.prototype.setupListeners = function setupListeners() {
    this.on('request permission', this.request_permission.bind(this));
    this.on('end', this.detach.bind(this));
    // proxy in both directions
    bgapp.on('proxy', this._onproxy = this.sendToTarget.bind(this));
    Client.EVENTS.forEach(function (event) {
        this.on(event, this.send.bind(this, event));
    }.bind(this));
};

Client.prototype.removeAllListeners = function removeAllListeners() {
    Connection.prototype.removeAllListeners.apply(this,[].slice.call(arguments));
    bgapp.removeListener('proxy', this._onproxy);
};

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
    var params = {};
    ['host', 'port', 'preferred'].forEach(function (key) {
        if (localStorage[key])
            params[key] = localStorage[key];
    });
    if (localStorage['reconnect']) params['reconnect'] = true;
    this.send('attach', {
        jid:this.jid,
        // in case a new account is created:
        password: passwd,
        params: params,
        cfg:{
            plugins:JSON.parse(localStorage['plugins'] || '[]'),
        },
    });
};

Client.prototype.detach = function detach() {
    this.send('detach', {jid:this.jid});
}

Client.prototype.request_permission = function request_permission() {
    chrome.infobars.show({
        path: "infobar.html#"+this.id,
        tabId: this.source.sender.tab.id,
    });
};



