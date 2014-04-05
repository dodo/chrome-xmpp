/*
 */
var isArray = Array.isArray;
var __slice = Array.prototype.slice;
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var ChromeEventEmitter = require('domevents').EventEmitter;
var Connection = require('../../lib/connection');
var gears = new Connection({id:'pageaction'});
gears.id = chrome.runtime.id;
var status = {}, actions = {}, pool = {};

gears.on('status', function (state) {
    if (state.purge) {
        chrome.pageAction.hide(state.tabId);
        delete status[state.accountId];
        return;
    }
    status[state.accountId] = state;
    var isOnline = state.connected || Object.keys(status).filter(function (id) {
        return status[id].tabId == state.tabId && status[id].connected;
    }).length > 0;
    chrome.pageAction.setPopup({
        tabId:state.tabId,
        popup:'pageaction.html#'+state.tabId,
    });
    chrome.pageAction.setIcon({
        tabId:state.tabId,
        path:isOnline ? 'online.png' : 'offline.png',
    });
    chrome.pageAction.show(state.tabId);

    if (pool[state.tabId])
        pool[state.tabId].send('status', state);
});

new ChromeEventEmitter(chrome.runtime).setMode('ext')
.on('connectExternal', function (port) {
    if (port.name !== gears.id) return;
    gears.bind(port);
});

// for pageaction
new ChromeEventEmitter(chrome.extension).setMode('ext')
.on('request', function (request, sender, sendResponse) {
    var action = function () {return {error:request.type + " not an action"}};
    if (actions[request.type])
        action = actions[request.type];
    sendResponse(action(request, sender));
});

new ChromeEventEmitter(chrome.runtime).setMode('ext')
.on('connect', function (port) {
    var client = new Connection({id:port.name}).bind(port);
    pool[client.id] = client;
    new ChromeEventEmitter(port).setMode('ext').on('disconnect', function () {
        client.removeAllListeners();
        delete pool[client.id];
    });
});

/*------------------------------------------------------------------------------
 * pageaction callbacks
 */

actions.connect = function (request, sender) {
    if (!request.id) return;
    if (!status[request.id]) return;

    gears.send('connect', status[request.id].accountId);
};

actions.disconnect = function (request, sender) {
    if (!request.id) return;
    if (!status[request.id]) return;

    gears.send('disconnect', status[request.id].accountId);
};

actions.status = function (request, sender) {
    if (!request.tabId) return;

    return Object.keys(status).filter(function (id) {
        return status[id].tabId == request.tabId;
    }).map(function  (id) {
        return status[id];
    });
};

//------------------------------------------------------------------------------
