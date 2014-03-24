/*
 * This script starts a pool client for each extension connection.
 */
var __slice = Array.prototype.slice;
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

function Repeater() {
    this.targets = [];
}

Repeater.prototype.pipe = function (target) {
    if (target) this.targets.push(target);
    return this;
};

Repeater.prototype.send = function (/*[args,…]*/) {
    var args = __slice.call(arguments);
    this.targets.forEach(function (target) {
        target.send.apply(target, args);
    });
};
