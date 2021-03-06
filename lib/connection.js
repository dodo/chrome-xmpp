var __slice = Array.prototype.slice;
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var NS = 'chrome-xmpp';

Connection.NS = NS;
module.exports = Connection;
util.inherits(Connection, EventEmitter);
function Connection(opts) {
    EventEmitter.call(this);
    this.id = opts && opts.id || [].map.call(crypto.getRandomValues(new Uint16Array(8)),function(x){return x.toString(16)}).join('');
    return this.pipe(opts && opts.target,
                     opts && opts.origin);
}

Connection.prototype.origin = '*';

Connection.prototype.removeAllListeners = function removeAllListeners() {
    EventEmitter.prototype.removeAllListeners.apply(this, [].slice.call(arguments));
    delete this.source;
    delete this.target;
};

Connection.prototype.send = function send(event /*, [args…]*/) {
    var args = __slice.call(arguments);
    if (this.target) {
        this.target.postMessage({
           id:this.id,
           event:event,
           args:args,
           ns:NS,
        }, this.origin);
    }
    return this;
};

Connection.prototype.sendToTarget = function sendToTarget(event /*, [args…]*/) {
    var args = __slice.call(arguments);
    if (this.source) {
        this.source.postMessage({
           id:this.id,
           event:event,
           args:args,
           ns:NS,
        }, this.origin);
    }
    return this;
};

Connection.prototype.listen = function listen(source) {
    this.source = source;
    if (source.addEventListener) {
        source.addEventListener('message', function (ev) {
            if (ev.source === source)
                this.onMessage(ev.data);
        }.bind(this));
    } else {
        this.origin = undefined; // not needed for message ports
        source.onMessage.addListener(this.onMessage.bind(this));
    }
    return this;
};

Connection.prototype.pipe = function pipe(target, origin) {
    if (target) this.target = target;
    if (origin) this.origin = origin;
    return this;
};

Connection.prototype.bind = function bind(port, ondisconnect) {
    this.listen(port).pipe(port);
    this.onDisconnect('target', function () {
        this.target = undefined;
        this.source = undefined;
        if (ondisconnect)
            ondisconnect.call(this);
    });
    return this;
};

Connection.prototype.onDisconnect = function onDisconnect(key, ondisconnect) {
    this[key].onDisconnect.addListener(function () {
        this[key] = undefined;
        if (ondisconnect)
            ondisconnect.call(this);
    }.bind(this));
    return this;
};


Connection.prototype.onMessage = function onMessage(ev) {
    if (this.validate(ev))
        this.emit.apply(this, ev.args);
};

Connection.prototype.validate = function validate(ev) {
    return (ev && ev.ns === NS && (!this.id || this.id === ev.id));
};


