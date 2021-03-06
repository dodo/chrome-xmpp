/*
 * This script starts accounts an associates them with extension connections
 * to pipe events multiplexed by extension
 * to different eventemitters in each account.
 */
require('error-tojson'); // i know, it's evil, but … meh
var isArray = Array.isArray;
var __slice = Array.prototype.slice;
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var xmpp = new (require('lightstream/backend/node-xmpp'));
var JID = xmpp.JID;
var Element = xmpp.Element;
var Connection = require('../../lib/connection');
var Account = require('./account');
var debug = util.debuglog('app:pool:client');


module.exports = Client;
util.inherits(Client, Connection);
function Client(port, accounts, frontend) {
    debug('new client');
    Connection.call(this).bind(port, function () {
        this.emit('unbind');
        this.removeAllListeners();
    });
    this.frontend = frontend;
    this.accounts = accounts;
    this.connections = {};
    this.setupListeners();
}

Client.prototype.setupListeners = function setupListeners() {
    this.on('attach', this.onAttach.bind(this));
    this.on('detach', this.onDetach.bind(this));
    var that = this;
    this.frontend.on('add', this.frontend.send.bind(this.frontend,'add'));
    this.frontend.on('update', this.frontend.send.bind(this.frontend,'update'));
    this.frontend.on('connect', function (opts) {
        debug("frontend connect", opts, opts && that.accounts[opts.id])
        if (opts && !that.accounts[opts.id]) {
            that.createAccount(opts);
        } else if (opts) {
            var account = that.accounts[opts.id];
            if (account.connected)
                account.update();
            else
                account.connect(opts);
        }
    });
    this.on('connect', function (opts) {
        debug("connect", opts, opts && that.accounts[opts.id])
        if (opts && that.accounts[opts.id]) {
            var account = that.accounts[opts.id];
            if (account.connected)
                account.update();
            else
                account.connect(opts);
        }
    });
    this.on('disconnect', function (opts) {
        debug("disconnect", opts, opts && that.accounts[opts.id])
        if (opts && that.accounts[opts.id]) {
            var account = that.accounts[opts.id];
            if (account.connected)
                account.disconnect();
            else
                account.update();
        }
    })
    this.frontend.on('disconnect', function (opts) {
        debug("frontend disconnect", opts, opts && that.accounts[opts.id])
        if (opts && that.accounts[opts.id]) {
            var account = that.accounts[opts.id];
            if (account.connected)
                account.disconnect();
            else
                account.update();
        }
    });
    this.frontend.on('detach', function (opts) {
        debug("frontend detach", opts, opts && that.accounts[opts.id])
        if (opts && that.accounts[opts.id])
            that.deleteAccount(opts);
    });
    this.on('detach', function (opts) {
        debug("detach", opts, opts && that.accounts[opts.id])
        if (opts && that.accounts[opts.id])
            that.deleteAccount(opts);
    });
};

Client.prototype.onMessage = function onMessage(ev) {
    // we pipe here just events from a connection from a tab to an account
    if (ev && ev.id) this.id = ev.id;
    return Connection.prototype.onMessage.call(this, ev);
};

Client.prototype.emit = function emit(event/*, [args,…]*/) {
    var args = __slice.call(arguments);
    var conn = this.connections[this.id];
    if (conn && conn.queue)
        conn.queue.push(args);
    else if (conn)
        // pipe event through to the right connection in an account
        conn.emit.apply(conn, args);
    else
        conn = this.connections[this.id] = {queue:[args]};
    Connection.prototype.emit.apply(this, args);
};

Client.prototype.proxy = function proxy(opts /*, [args…]*/) {
    var args = __slice.call(arguments, 1); // dont send options
    var data = args.map(jsonify);
    debug('proxy', "»", this.id, data, this.target)
    if (this.target) {
        this.target.postMessage({
            event:'proxy',
            args:data,
            id:this.id,
            ns:Connection.NS,
            resource: opts.resource,
            jid: opts.jid,
        });
    }
};

Client.prototype.send = function send(id, event /*, [args…]*/) {
    var args = __slice.call(arguments, 1); // dont send id
    var data = args.map(jsonify);
    debug('postmessage', event, "»", id, data, this.target)
    if (event === 'status' || id === 'frontend') {
        // multiplex over to the frontend pages
        this.frontend.send.apply(this.frontend, args);
    }
    if (this.target) {
        this.target.postMessage({
            event:event,
            args:data,
            ns:Connection.NS,
            id:id,
        });
    }
};

Client.prototype.onAttach = function onAttach(account) {
    debug('attach ' + this.id);
    var conn = new EventEmitter();
    account.connection = conn;
    account.cid = this.id;
    var queue = this.connections[this.id] && this.connections[this.id].queue || [];
    // pipe events send from account to connection and back
    conn.send = this.proxy.bind(this, {
        resource:account.resource,
        jid:account.jid,
    });
    this.connections[this.id] = conn;
    // hook to an account
    if (!this.accounts[account.id])
        this.createAccount(account);
    this.accounts[account.id].attach(account);
    queue.forEach(function (args) {
        conn.emit.apply(conn, args);
    });
};

Client.prototype.onDetach = function onDetach(account) {
    debug('detach ' + this.id);
    account.cid = this.id;
    account.connection = this.connections[this.id];
    if (this.accounts[account.id]) {
        this.accounts[account.id].detach(account);
        delete this.connections[this.id].send;
        delete this.connections[this.id];
        if (!this.accounts[account.id].fd)
            delete this.accounts[account.id];
    }
};

Client.prototype.createAccount = function (opts) {
    debug('create account ' + opts.id + ' on ' + this.id);
    var account = new Account(opts);
    this.accounts[opts.id] = account;
    account.update = updateStatus.bind(this, account);
    account.fd
        .on('offline', account.update)
        .on('online',  account.update);
    return account;
};

Client.prototype.deleteAccount = function (account) {
    debug('delete account ' + account.id + ' on ' + this.id);
    account.cid = this.id;
    this.accounts[account.id].detach(account);
    delete this.accounts[account.id];
};

function updateStatus(account) {
    this.send('frontend', 'status', account.id, {connected:account.connected});
}

function mapObject(obj, fun) {
    var res = {};
    Object.keys(obj).forEach(function (key) {
        res[key] = fun(obj[key], key);
    });
    return res;
}

function jsonify(arg) {
    return (arg && arg.toJSON) ? (
        mapObject(arg.toJSON(), jsonify) // just to be sure
    ) : (arg instanceof JID) ? (
        arg.toString()
    ) : isArray(arg) ? (
        arg.map(jsonify)
    ) : (arg && typeof arg === 'object') ? (
        mapObject(arg, jsonify)
    ) : arg;
}

