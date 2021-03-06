/*
 * This script starts a pool client for each extension connection.
 */
require('sawrocket-xmpp/initrd'); // let browserify find all stuff needed to get node-xmpp running
var isArray = Array.isArray;
var __slice = Array.prototype.slice;
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var ChromeEventEmitter = require('domevents').EventEmitter;
var Connection = require('../../lib/connection');
var Client = require('./pool');
var debug = util.debuglog('app:background');
var accounts = {};
var pool = {}; // of each extension connection
var action = {
    extension: new Connection({id:'extension'}),
    browser:   new Connection({id:'browseraction'}),
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
        .pipe(action.extension)
        .pipe(action.browser)
});


new ChromeEventEmitter(chrome.app.runtime).setMode('ext')
.on('launched', function (ev) {
    debug("Launched", ev);
    setTimeout(function () {
        Object.keys(pool).forEach(function (id) {
            pool[id].send('frontend', 'launch');
        });
    }, 100);
})
.on('restarted', function (ev) {
    // FIXME TODO reconnect all clients and ports
    debug("Restarted", ev)
});


new ChromeEventEmitter(chrome.runtime).setMode('ext')
.on('connectExternal', function (port) {
    debug('connection from external', port)
    if (port.name === 'tab-options') {
        options.tab.bind(port);
    } else if (port.name === 'browseraction-options') {
        options.browseraction.bind(port);
    } else if (port.name === 'browseraction') {
        action.browser.bind(port);
    } else if (port.name === 'extension') {
        action.extension.bind(port);
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
    debug('proxy', this, event, listener, target)
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
    debug("pipe", Object.keys(this._events),this)
    Object.keys(this._events).forEach(function (event) {
        if (event !== 'newListener' && event !== 'removeListener')
            this.proxy(event, null, target);
    }.bind(this));
    return this;
};

Repeater.prototype.send = function (/*[args,…]*/) {
    var args = __slice.call(arguments);
    debug("repeat", args)
    this.targets.forEach(function (target) {
        target.send.apply(target, args);
    });
};
