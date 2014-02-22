var Client = require('./pool').Client;
var pool = require('./pool').pool;
var actions = {};

chrome.app.runtime.onLaunched.addListener(function() {

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
    port.onMessage.addListener(function (message) {
        if (!message.action) return;
        if (!actions[message.action]) return;

        return actions[message.action].call(port, message);
        // return true; // send a response asynchronously
    });
});

//------------------------------------------------------------------------------

actions.attach = function (opts) {
    opts.port = this;
    if (pool[opts.jid]) {
        pool[opts.jid].attach(opts);
        // TODO update new extension-client with current state (connected|offline|online|etc)
    } else {
        pool[opts.jid] = new Client(opts);
    }
};

actions.detach = function (opts) {
    opts.port = this;
    if (pool[opts.jid]) {
        pool[opts.jid].detach(opts);
    }
};