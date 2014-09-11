/*
 * This script handles user accounts and their xmpp connections.
 */
var __slice = Array.prototype.slice;
var util = require('util');
var Lightstream = require('lightstream');
var XEP = require('lightstream/xep');
function xep(name) {return XEP[name]}


module.exports = Client;
function Client(opts) {
    var that = this;
    this.id = opts.id;
    this.stayAlive = opts.cfg.stayAlive;
    this.cids = {};
    this.connected = false;
    var fd = this.fd = new Lightstream({
        backend:require('lightstream/backend/node-xmpp'),
    }).use(opts.cfg.plugins.filter(xep).map(xep));
    fd.on( 'online', function () {that.connected = true });
    fd.on('offline', function () {that.connected = false});
    fd.on('error', console.error.bind(console, "lightstream:"));
    process.nextTick(this.connect.bind(this, opts));
}

Client.prototype.connect = function connect(opts) {
    this.id = opts.id;
    this.jid = opts.jid;
    this.fulljid = opts.jid;
    this.resource = opts.resource;
    if (this.resource)
        this.fulljid += "/" + this.resource;
    this.fd.connect(this.fulljid, opts.password, opts.params);
    return this;
};

Client.prototype.disconnect = function disconnect() {
    this.fd.disconnect();
    return this;
};

Client.prototype.attach = function attach(opts) {
    var that = this;
    var conn = this.cids[opts.cid] = opts.connection;
    conn.on('call', function (method) {
        var part = method.split('.');
        var args = __slice.call(arguments, 1); // no method
        var extension = that.fd.extension[part[0]];
            method = extension && extension[part[1]];
        if (method) {
            try {
                method.apply(extension, args);
            } catch(err) {
                err = err.stack || err.message || err;
                conn.send('error',"Error calling "+part.join('.')+": "+err);
            }
        } else {
            conn.send('error', util.format(
                "unknown method '%s' within %sextension '%s'",
                part[1], (extension ? "" : "unknown "), part[0]))
        }
    });
    conn.on('listen', function (event) {
        // TODO filter cids for permissions
        that.fd.on(event, conn.send.bind(conn, event));
    });
    if (this.connected) process.nextTick(function () {
        conn.send('connect', opts.jid);
        conn.send('online');
    });
    return this;
};

Client.prototype.detach = function detach(opts) {
    if (!this.cids[opts.cid]) return;
    this.cids[opts.cid].removeAllListeners();
    delete this.cids[opts.cid];
    if (!this.stayAlive && Object.keys(this.cids).length === 0)
        this.disconnect();
    return this;
};

Client.prototype.send = function send(/*[event, args…]*/) {
    var args = __slice.call(arguments);
    Object.keys(this.cids).forEach(function (cid) {
        var conn = this.cids[cid];
        conn.send.apply(conn, args);
    }.bind(this));
};




