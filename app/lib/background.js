/*
 * This script starts a pool client for each extension connection.
 */
var isArray = Array.isArray;
var __slice = Array.prototype.slice;
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var ChromeEventEmitter = require('domevents').EventEmitter;
var Connection = require('../../lib/connection');
var Client = require('./pool');
var accounts = {};
var pool = {}; // of each extension connection
var action = {
    browser: new Connection({id:'browseraction'}),
};
var options = {
    browseraction: new Connection({id:'browseraction-options'}),
    tab:           new Connection({id:'tab-options'}),
};
var frontend;
process.nextTick(function () {
    frontend = new Repeater()
        .pipe(options.browseraction)
        .pipe(options.tab)
        .pipe(action.browser)
});


new ChromeEventEmitter(chrome.app.runtime).setMode('ext')
.on('launched', function (ev) {

//     chrome.notifications.create("onLaunched", {
//         title: "XMPP Background Gears",
//         message: "Launched! " + chrome.runtime.id,
//         type: "basic",
//         iconUrl: "icon.png",
//     }, function (id) {
//         console.log(id, "created");
//     });
    setTimeout(function () {
        Object.keys(pool).forEach(function (id) {
            pool[id].send('frontend', 'launch');
        });
    }, 100);
})
.on('restarted', function (ev) {
    // FIXME TODO reconnect all clients and ports
    console.warn("Restarted", ev)
});


new ChromeEventEmitter(chrome.runtime).setMode('ext')
.on('connectExternal', function (port) {
    if (port.name === 'tab-options') {
        options.tab.bind(port);
    } else if (port.name === 'browseraction-options') {
        options.browseraction.bind(port);
    } else if (port.name === 'browseraction') {
        action.browser.bind(port);
    } else if (port.name === chrome.runtime.id) {
        var client = new Client(port, accounts, frontend);
        pool[client.id] = client;
        client.once('unbind', function () {
            delete pool[client.id];
        });
    } else {
        console.error("port ignored", port);
    }
});


util.inherits(Repeater, EventEmitter);
function Repeater() {
    EventEmitter.call(this);
    this.targets = [];
    this.on('removeListener', function (event, listener) {
        this.targets.forEach(function (target) {
            target.removeListener(event, listener);
        });
    });
    this.on('newListener', function (event, listener) {
        if (!this._events[event] || this._events[event].length === 0) {
            this.targets.forEach(this.proxy.bind(this, event, listener));
        }
    });
}

Repeater.prototype.proxy = function (event, listener, target) {
    var emit = this.emit.bind(this, event);
    emit.listener = listener
                 || (this._events[event] && this._events[event][0])
                 ||  this._events[event];
    target.on(event, emit);
    return this;
};

Repeater.prototype.pipe = function (target) {
    if (!target) return this;
    this.targets.push(target);
    Object.keys(this._events).forEach(function (event) {
        if (event !== 'newListener' && event !== 'removeListener')
            this.proxy(event, null, target);
    }.bind(this));
    return this;
};

Repeater.prototype.send = function (/*[args,…]*/) {
    var args = __slice.call(arguments);
    this.targets.forEach(function (target) {
        target.send.apply(target, args);
    });
};
