/*
 * This script starts a pool client for each extension connection.
 */
var Client = require('./pool');
var accounts = {};
var pool = {}; // of each extension connection

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
    var client = new Client(port, accounts);
    pool[client.id] = client;
    port.onDisconnect.addListener(function () {
        client.removeAllListeners();
        delete pool[client.id];
    });
});