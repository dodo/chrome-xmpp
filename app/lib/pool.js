/*
 * This script starts accounts an associates them with extension connections
 * to pipe events multiplexed by extension
 * to different eventemitters in each account.
 */
var __slice = Array.prototype.slice;
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var Element = require('ltx/lib/element').Element;
var Connection = require('../../lib/connection');
var Account = require('./account');


module.exports = Client;
util.inherits(Client, Connection);
function Client(port, accounts, frontend) {
    Connection.call(this, {target:port}).listen(port);
    this.frontend = frontend;
    this.accounts = accounts;
    this.connections = {};
    this.setupListeners();
}

Client.prototype.setupListeners = function setupListeners() {
    this.on('attach', this.onAttach.bind(this));
    this.on('detach', this.onDetach.bind(this));
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
//     if (event === 'attach' || event === 'detach')
        Connection.prototype.emit.apply(this, args);
};

Client.prototype.send = function send(id, event /*, [args…]*/) {
    var args = __slice.call(arguments, 1); // dont send id
    var data = args.map(jsonify);
    if (event === 'status') {
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

Client.prototype.onAttach = function onAttach(opts) {
    var that = this;
    var conn = new EventEmitter();
    opts.connection = conn;
    opts.id = this.id;
    var queue = this.connections[this.id] && this.connections[this.id].queue || [];
    // pipe events send from account to connection and back
    conn.send = this.send.bind(this, this.id, 'proxy');
    this.connections[this.id] = conn;
    // hook to an account
    if (this.accounts[opts.jid]) {
        this.accounts[opts.jid].attach(opts);
    } else {
        var updateStatus = function () {
            that.send(opts.id, 'status', opts.jid, {
                connected:this.connected,
            });
        };
        this.accounts[opts.jid] = new Account(opts);
        this.accounts[opts.jid].fd
            .on('offline', updateStatus)
            .on('online',  updateStatus)
    }
    queue.forEach(function (args) {
        conn.emit.apply(conn, args);
    });
};

Client.prototype.onDetach = function onDetach(opts) {
    opts.id = this.id;
    opts.connection = this.connections[this.id];
    if (this.accounts[opts.jid]) {
        this.accounts[opts.jid].detach(opts);
        delete this.connections[this.id].send;
        delete this.connections[this.id];
        if (!this.accounts[opts.jid].fd)
            delete this.accounts[opts.jid];
    }
};

function jsonify(arg) {
    return (arg instanceof Element) ? {
        name:arg.name,
        attrs:arg.attrs,
        children:__slice.call(arg.children || []).map(jsonify),
    } : (arg instanceof Error) ? (
        arg.stack || arg.message
    ) : arg;
}

