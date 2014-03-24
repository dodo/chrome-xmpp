/*
 * This script starts a pool client for each extension connection.
 */
var isArray = Array.isArray;
var __slice = Array.prototype.slice;
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var Connection = require('../../lib/connection');
var Client = require('./pool');
var accounts = {};
var pool = {}; // of each extension connection
var frontend;
var popup = new Connection({id:'popup'});
var options = {
    popup:  new Connection({id:'popup-options'}),
    tab:    new Connection({id:'tab-options'}),
};

chrome.app.runtime.onLaunched.addListener(function() {
    frontend = new Repeater()
        .pipe(options.popup)
        .pipe(options.tab)
        .pipe(popup);

    chrome.notifications.create("onLaunched", {
        title: "XMPP Background Gears",
        message: "Launched! " + chrome.runtime.id,
        type: "basic",
        iconUrl: "icon.png",
    }, function (id) {
        console.log(id, "created");
    });

});


chrome.runtime.onConnectExternal.addListener(function (port) {
    if (port.name === 'tab-options') {
        options.tab.pipe(port);
        port.onDisconnect.addListener(function () {
            options.tab.target = undefined;
        });
    } else if (port.name === 'popup-options') {
        options.popup.pipe(port);
        port.onDisconnect.addListener(function () {
            options.popup.target = undefined;
        });
    } else if (port.name === 'popup') {
        popup.pipe(port);
        port.onDisconnect.addListener(function () {
            popup.target = undefined;
        });
    } else {
        var client = new Client(port, accounts, frontend);
        pool[client.id] = client;
        port.onDisconnect.addListener(function () {
            client.removeAllListeners();
            delete pool[client.id];
        });
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
