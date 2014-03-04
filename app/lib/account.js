/*
 * This script handles user accounts and their xmpp connections.
 */
var __slice = Array.prototype.slice;
var util = require('util');
var Lightstream = require('lightstream');
var XEP = require('lightstream/xep');
function xep(name) {return XEP[name]}


// Client.EVENTS = ['connect', 'reconnect', 'disconnect', 'online', 'offline', 'error', 'end', 'stanza'];

module.exports = Client;
function Client(opts) {
    this.stayAlive = opts.cfg.stayAlive;
    this.jid = opts.jid;
    this.ids = {};
    this.attach(opts);
    var fd = this.fd = new Lightstream({
        backend:require('lightstream/backend/node-xmpp'),
    }).use(opts.cfg.plugins.filter(xep).map(xep));
    process.nextTick(function () {
        fd.connect(opts.jid, opts.password, opts.params);
    });
}

Client.prototype.attach = function attach(opts) {
    var that = this;
    var conn = this.ids[opts.id] = opts.connection;
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
        // TODO filter ids for permissions
        that.fd.on(event, conn.send.bind(conn, event));
    });
//     conn.on('newListener', function (event) {
//         if (conn.listeners(event).length === 0) {
//             if (event.indexOf('.') === -1) {
//                 that.fd.on(event, that.emit.bind(that, event));
//             } else {
//                 var steps = event.split('.');
//                     event = steps.pop();
//                 var ptr = that.fd.extension;
//                 steps.forEach(function (step) {
//                     ptr = ptr && ptr[step];
//                 });
//                 if (ptr && ptr[method]) {
//                     ptr[method].on(event, )
//                 }
//             }
//         }
//     });
    // TODO FIXME pipe events from injectxmpp to client which should be an eventemitter
//     Client.EVENTS.forEach(function (event) {
//         conn.on(event, function () {
//             var args = [event].concat(Array.prototype.slice.call(arguments));
//             // TODO filter ids for permissions
//             that.emit.apply(that, args);
//         });
//     });
};

Client.prototype.detach = function detach(opts) {
    if (!this.ids[opts.id]) return;
    this.ids[opts.id].removeAllListeners();
    delete this.ids[opts.id];
    if (!this.stayAlive && Object.keys(this.ids).length === 0)
        this.fd.disconnect();
};

// Client.prototype.setupEvents = function setupEvents() {
//     var that = this;
//     Client.EVENTS.forEach(function (event) {
//         that.fd.on(event, function () {
//             var args = [event].concat(__slice.call(arguments));
//             // TODO filter ids for permissions
//             that.send.apply(that, args);
//         });
//     });
// };

Client.prototype.send = function send(/*[event, args…]*/) {
    var args = __slice.call(arguments);
    Object.keys(this.ids).forEach(function (id) {
        var conn = this.ids[id];
        conn.send.apply(conn, args);
    }.bind(this));
};




