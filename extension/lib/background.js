/*
 * This script greps for background app,
 * starts infobar on connection apptempt from tab,
 * handles account configs,
 * …
 */
var __slice = Array.prototype.slice;
var util = require('util');
var ChromeEventEmitter = require('domevents').EventEmitter;
var Connection = require('../../lib/connection');
var attachOptions = require('../client');
function noop() {};

var core, actions = {}, pool = {}, status = {}, tabs = {}, plugins = {}, notifications = {};
var arguments_cache = { notifications:{} };
var backport = new Connection({id:'extension'});

chrome.browserAction.disable();
loadCore(function reload(new_core) {
    core = new_core;
});
self.getAppID = function getAppID() {
    return core && core.appid;
};
loadPlugins();

// for core and plugins
new ChromeEventEmitter(chrome.management).setMode('ext')
.on('enabled', function (app) {
    if(!/^XMPP/.test(app.name)) return;
    if (app.id === chrome.runtime.id) return;

    if (app.type === 'packaged_app') {
        if (!core) {
            chrome.notifications.clear('core disabled', noop);
            launchCore(app.id, function reload(new_core) {
                core = new_core;
            });
        }
    } else createPlugin(app.id);
})
.on('disabled', function (app) {
    if(!/^XMPP/.test(app.name)) return;
    if (app.id === chrome.runtime.id) return;

    if (core && app.id === core.appid) {
        createNotification('core disabled', function () {
            core = new_core;
        }, appid);
    }
})
.on('installed', function (app) {
    if(!/^XMPP/.test(app.name)) return;
    if (app.id === chrome.runtime.id) return;

    if (!core) {
        chrome.notifications.clear('no core', noop);
        launchCore(app.id, function reload(new_core) {
            core = new_core;
        });
    }
});

new ChromeEventEmitter(chrome.notifications).setMode('ext')
.on('clicked', function (id) {
    console.log("notification clicked", id)
    var notification = notifications[id];
    if (notification && notification.callback) {
        var args = arguments_cache.notifications[id] || [];
        notification.callback.apply(this, args);
    }
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
    pool[port.name] = new Client(port);
});


/*------------------------------------------------------------------------------
 * notification button callbacks
 */

notifications['no core'] = {
    title: "XMPP - no core!",
    message: [
        '"XMPP - core"'+"app not found!",
        "This is needed to connect to the outer world!",
        "→ Please install app."
    ].join("\n\n"),
};

notifications['core disabled'] = {
    title: "XMPP - core disabled!",
    message: [
        '"XMPP - core"'+" app seems to be disabled.",
        "This is needed to connect to the outer world!",
        "→ Click notification to enable app."
    ].join("\n\n"),
    callback: function (reload, appid) {
        chrome.management.setEnabled(appid, !!'enabled', function () {
            chrome.notifications.clear('core disabled', noop);
            launchCore(appid, reload);
        });
    },
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
    this.allowed = false;
    Connection.call(this, {
        target:core.source,
        id:port.name,
    }).listen(port);
    this.onDisconnect('source', this.close);
    this.onDisconnect('target', this.close);
    port.name = this.id;
    this.setupListeners();
}

Client.prototype.setupListeners = function setupListeners() {
    this.on('request permission', this.request_permission.bind(this));
    this.on( 'remove permission', this.remove_permission.bind(this));
    this.on('disconnect', this.disconnect.bind(this));
    this.on('connect', this.connect.bind(this));
    // proxy in both directions
    core.on('proxy', this._onproxy = this.onProxy.bind(this));
    Client.EVENTS.forEach(function (event) {
        this.on(event, this.send.bind(this, event));
    }.bind(this));
};

Client.prototype.removeAllListeners = function removeAllListeners() {
    Connection.prototype.removeAllListeners.apply(this,[].slice.call(arguments));
    core.removeListener('proxy', this._onproxy);
};

Client.prototype.connect = function connect() {
    if (this.allowed) this.getAttachOptions(this.aid, function (opts) {
        this.send('connect', opts);
    }.bind(this));
    else this.sendToTarget('error', 'access denied');
};

Client.prototype.disconnect = function disconnect() {
    if (this.allowed) this.send('disconnect', {id:this.aid});
    else this.sendToTarget('error', 'access denied');
};

Client.prototype.close = function close() {
    if (this.source)
        this.source.disconnect();
    this.detach();
    this.removeAllListeners();
    delete pool[this.id];
    removeTab(this.aid);
};

Client.prototype.allow = function allow(accountid) {
    this.allowed = true;
    this.sendToTarget('allow', 'allowed');
    this.attach(accountid);
};

Client.prototype.deny = function deny() {
    this.allowed = false;
    this.sendToTarget('error', 'access denied');
    this.close();
};

Client.prototype.getAttachOptions = function (aid, done) {
    attachOptions(aid, function (opts) {
        this.aid = opts.id;
        if (done) done(opts);
    }.bind(this));
};

Client.prototype.attach = function attach(accountid) {
    this.getAttachOptions(accountid, function (opts) {
        this.tab = createTab(opts, this.source.sender.tab.id);
        this.send('attach', opts);
    }.bind(this));
}

Client.prototype.detach = function detach() {
    this.send('detach', {id:this.aid});
};

Client.prototype.request_permission = function request_permission() {
    if (this.allowed)
        return this.connect();
    chrome.infobars.show({
        path: "infobar.html#"+this.id,
        tabId: this.source.sender.tab.id,
    });
};

Client.prototype.remove_permission = function remove_permission() {
    this.detach();
    this.deny();
};


util.inherits(Core, Connection);
function Core(appid) {
    Connection.call(this);
    this.appid = appid;
    this.id = null; // allow all ids
    this.on('error', console.error.bind(console, '[core conn error]'));
    this.listen(chrome.runtime.connect(appid, {name:appid}));
    backport.bind(chrome.runtime.connect(appid, {name:backport.id}));
    backport.on('status', function (aid, state) {
        console.log("set status", aid, state)
        status[aid] = state;
        updateTab(aid, state);
    });
}

Core.prototype.onMessage = function (ev) {
    if (this.validate(ev)) {
        if (ev.event === 'proxy') {
            this.emit('proxy', ev);
        } else {
            this.emit.apply(this, ev.args);
        }
    }
}


function loadCore(reload, retry) {
    if (core) return;
    if (typeof retry !== 'number') retry = 100; // 30s
    else if (retry < 0) retry = 0;
    chrome.notifications.clear('core disabled', noop);
    chrome.management.getAll(function (apps) {
        var appid, foundIt = false;
        apps.forEach(function (app) {
            if(!/^XMPP/.test(app.name)) return;
            if(app.type !== 'packaged_app') return;
            appid = app.id;
            if (app.enabled)
                foundIt = true;
            else
                retry = 0;
        });
        if (foundIt) {
            launchCore(appid, reload);
        } else if (retry) {
            setTimeout(loadCore.bind(this, reload, --retry), 300);
        } else {
            reload(undefined);
            createNotification(appid ? 'core disabled' : 'no core', reload, appid);
        }
    });
}

var launched = {};
function launchCore(appid, load) {
    if (core) return;
    if (launched[appid]) {
        launched[appid].push(load);
        return;
    }
    launched[appid] = [load];
    chrome.management.launchApp(appid, function () {
        var loads = launched[appid];
        delete launched[appid];
        createCore(appid, function (new_core) {
            loads.forEach(function (load) {
                load(new_core);
            });
        });
    });
}

function createCore(appid, load) {
    if (core) return;
    var conn = new Core(appid);
    conn.on('launch', function () {
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
    conn.onDisconnect('source', function () {
        chrome.browserAction.disable();
        load(undefined);
        // TODO FIXME hopefully we dont get any events until core is loaded again
        setTimeout(loadCore.bind(this, load), 300);
    });
    load(conn);
}

function loadPlugins() {
    chrome.management.getAll(function (apps) {
        apps.filter(function (app) {
            return /^XMPP/.test(app.name)
                && app.id !== chrome.runtime.id
                && app.type === 'extension';
        }).map(function (app) {
            return app.id;
        }).forEach(createPlugin);
    });
}

function createPlugin(appid) {
    plugins[appid] = new Connection({id:appid})
        .on('error', console.error.bind(console, '[plugin ' + appid + ' error]'))
        .on('connect', function (aid) {
            if (!aid) return;
            Object.keys(pool).forEach(function (id) {
                if (pool[id].aid == aid) {
                    pool[id].getAttachOptions(aid, function (opts) {
                        backport.send('connect', opts);
                    });
                }
            });
        })
        .on('disconnect', function (aid) {
            if (!aid) return;
            backport.send('disconnect', {id:aid});
        })
        .on('detach', function (aid) {
            if (!aid) return;
            backport.send('detach', {id:aid});
        })
        .on('request permission', function (aid) {
            if (!aid) return;
            Object.keys(pool).forEach(function (id) {
                if (pool[id].aid == aid)
                    pool[id].request_permission();
            });
        })
        .on('remove permission', function (aid) {
            if (!aid) return;
            Object.keys(pool).forEach(function (id) {
                if (pool[id].aid == aid)
                    pool[id].remove_permission();
            });
        })
        .bind(chrome.runtime.connect(appid, {name:appid}), function () {
            this.removeAllListeners();
            delete plugins[this.id];
        });
}

function createNotification(id /*, [args,…]*/) {
    var n = notifications[id];
    arguments_cache.notifications[id] = __slice.call(arguments, 1);
    chrome.notifications.create(id, {
        title: n.title,
        message: n.message,
        type: n.type || "basic",
        iconUrl: n.icon || "icon.png",
        isClickable: !!n.callback,
    }, noop);
};

function updateBadge(tabid) {
    var accountCount = Object.keys(tabs).filter(function (id) {
        return tabs[id].id == tabid;
    }).length;
    chrome.browserAction.setBadgeText({
        tabId:tabid,
        text: accountCount ? ""+accountCount : "",
    });
}

function createTab(opts, tabid) {
    tabs[opts.id] = {
        resource:opts.resource,
        jid:opts.jid,
        id:tabid,
    };
    updateTab(opts.id, {connected:false});
    return tabs[opts.id];
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


