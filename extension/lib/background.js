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

var bgapp, bgappid, actions = {}, pool = {}, status = {}, tabs = {}, plugins = {};
var backend = new Connection({id:'extension'});

chrome.browserAction.disable();
chrome.management.getAll(function (apps) {
    apps.forEach(function (app) {
        if(!/^XMPP/.test(app.name)) return;
        if (app.id === chrome.runtime.id) return;
        if(app.type !== 'packaged_app')
            return createPlugin(app.id);
        bgappid = app.id;
    });
    if (bgappid) {
        chrome.management.launchApp(bgappid, function () {
            bgapp = new Connection();
            bgapp.id = null; // allow all ids
            bgapp.on('error', console.error.bind(console, '[bgapp error]'));
            backend.pipe(chrome.runtime.connect(bgappid, {name:backend.id}));
            bgapp.listen(chrome.runtime.connect(bgappid, {name:bgappid}));
            bgapp.on('status', function (aid, state) {
                status[aid] = state;
                updateTab(aid, state);
            });
            bgapp.on('launch', function () {
                var enabled = false;
                return toggle(16);

                function toggle(i) {
                    if (enabled)
                        chrome.browserAction.disable();
                    else
                        chrome.browserAction.enable();
                    enabled = !enabled;
                    if (i--) setTimeout(toggle.bind(this, i), 80);
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
        removeTab(client.aid);
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

Client.prototype.allow = function allow(accountid) {
    this.sendToTarget('allow', 'allowed');
    this.attach(accountid);
};

Client.prototype.deny = function deny() {
    this.sendToTarget('error', 'access denied');
};

Client.prototype.getAttachOptions = function attach(aid, done) {
    attachOptions(aid, function (opts) {
        removeTab(this.aid);
        this.aid = opts.id;
        tabs[this.aid] = {
            id:this.source.sender.tab.id,
            resource:opts.resource,
            jid:opts.jid,
        };
        updateTab(this.aid, {connected:false});
        if (done) done(opts);
    }.bind(this));
};

Client.prototype.attach = function (accountid) {
    this.getAttachOptions(accountid, this.send.bind(this, 'attach'));
}

Client.prototype.detach = function detach() {
    this.send('detach', {id:this.aid});
};

Client.prototype.request_permission = function request_permission() {
    chrome.infobars.show({
        path: "infobar.html#"+this.id,
        tabId: this.source.sender.tab.id,
    });
};



function createPlugin(appid) {
    var plugin = new Connection({id:appid});
    plugin.on('error', console.error.bind(console, '[plugin ' + appid + ' error]'));
    plugin.bind(chrome.runtime.connect(appid, {name:appid}));
    plugins[plugin.id] = plugin;
    plugin.on('connect', function (aid) {
        if (!aid) return;
        Object.keys(pool).forEach(function (id) {
            if (pool[id].aid == aid)
                pool[id].getAttachOptions(aid, function (opts) {
                    backend.send('connect', opts);
                });
        });
    });
    plugin.on('disconnect', function (aid) {
        if (!aid) return;
        backend.send('disconnect', {id:aid});
    });
}

function updateBadge(tabid) {
    var accountCount = Object.keys(tabs).filter(function (id) {
        return tabs[id].id == tabid;
    }).length;
    chrome.browserAction.setBadgeText({
        tabId:tabid,
        text: accountCount ? ""+accountCount : "",
    });
}

function updateTab(aid, status) {
    if (!aid) return;
    var tab = tabs[aid];
    if (!tab) return;
    updateBadge(tab.id);
    Object.keys(plugins).forEach(function (id) {
        plugins[id].send('status', {
            connected:status.connected,
            resource:tab.resource,
            accountId:aid,
            tabId:tab.id,
            jid:tab.jid,
            id:id,
        });
    });
}

function removeTab(aid) {
    if (!aid) return;
    var tab = tabs[aid];
    if (!tab) return;
    delete tabs[aid];
    updateBadge(tab.id);
    Object.keys(plugins).forEach(function (id) {
        plugins[id].send('status', {
            purge:true,
            accountId:aid,
            tabId:tab.id,
            id:id,
        });
    });
}


