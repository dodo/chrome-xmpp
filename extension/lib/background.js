/*
 * This script greps for background app,
 * starts infobar on connection apptempt from tab,
 * handles account configs,
 * …
 */
var util = require('util');
var ChromeEventEmitter = require('domevents').EventEmitter;
var Connection = require('../../lib/connection');
var attachOptions = require('../client');

var bgapp, bgappid, actions = {}, pool = {}, status = {};
chrome.management.getAll(function (apps) {
    if(apps.some(function (app) {
        if(app.type !== 'packaged_app') return;
        if(app.name !== "XMPP") return;
        bgappid = app.id;
        return true;
    })) {
        chrome.management.launchApp(bgappid, function () {
            bgapp = new Connection();
            bgapp.id = null; // allow all ids
            bgapp.on('error', console.error.bind(console));
            bgapp.listen(chrome.runtime.connect(bgappid, {name:bgappid}));
            bgapp.on('status', function (id, state) {
                status[id] = state;
            });
            bgapp.on('launch', function () {
                var enabled = true;
                return toggle(11);

                function toggle(i) {
                    if (enabled)
                        chrome.browserAction.disable();
                    else
                        chrome.browserAction.enable();
                    enabled = !enabled;
                    if (i--) setTimeout(toggle.bind(this, i), 100);
                }
            });
        });
    };
});

// for infobar
new ChromeEventEmitter(chrome.extension).setMode('ext')
.on('request', function (request, sender, sendResponse) {
    var action = function () {return {error:request.type + " not an action"}};
    if (actions[request.type])
        action = actions[request.type];
    sendResponse(action(request, sender));
});

new ChromeEventEmitter(chrome.runtime).setMode('ext')
.on('connect', function (port) {
    var client = new Client(port);
    pool[client.id] = client;
    new ChromeEventEmitter(port).setMode('ext').on('disconnect', function () {
        client.removeAllListeners();
        delete pool[client.id];
    });
});

self.getAppID = function getAppID() {
    return bgappid;
};

/*------------------------------------------------------------------------------
 * infobar callbacks
 */

actions.allow = function (request, sender) {
    if (!request.id) return;
    if (!pool[request.id]) return;

    return pool[request.id].allow(request.account);
};

actions.deny = function (request, sender) {
    if (!request.id) return;
    if (!pool[request.id]) return;

    return pool[request.id].deny();
};

actions.status = function (request, sender) {
    if (!request.id) return;

    return status[request.id] || {connected:false};
};

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
    this.on('disconnect', this.detach.bind(this));
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

Client.prototype.allow = function allow(account) {
    this.sendToTarget('allow', 'allowed');
    this.attach(account);
};

Client.prototype.deny = function deny() {
    this.sendToTarget('error', 'access denied');
};

Client.prototype.attach = function attach(id) {
    attachOptions(id, function (opts) {
        this.id = opts.id;
        this.send('attach', opts);
    }.bind(this));
};

Client.prototype.detach = function detach() {
    this.send('detach', {id:this.id});
};

Client.prototype.request_permission = function request_permission() {
    chrome.infobars.show({
        path: "infobar.html#"+this.id,
        tabId: this.source.sender.tab.id,
    });
};



