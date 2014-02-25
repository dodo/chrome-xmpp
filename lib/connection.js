var EventEmitter = require('events').EventEmitter;
var util = require('util');
var NS = 'chrome-xmpp';

Connection.NS = NS;
module.exports = Connection;
function Connection(opts) {
    EventEmitter.call(this);
    this.id = opts && opts.id || [].map.call(crypto.getRandomValues(new Uint16Array(8)),function(x){return x.toString(16)}).join('');
    this.pipe(opts && opts.target,
              opts && opts.origin);
}
util.inherits(Connection, EventEmitter);

Connection.prototype.origin = '*';

Connection.prototype.send = function send(event /*, [args…]*/) {
    var args = Array.prototype.slice.call(arguments);
    if (this.target) {
        this.target.postMessage({
           id:this.id,
           event:event,
           args:args,
           ns:NS,
        }, this.origin);
    }
};

Connection.prototype.sendToTarget = function sendToTarget(event /*, [args…]*/) {
    var args = Array.prototype.slice.call(arguments);
    if (this.source) {
        this.source.postMessage({
           id:this.id,
           event:event,
           args:args,
           ns:NS,
        }, this.origin);
    }
};

Connection.prototype.listen = function listen(source) {
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
};


Connection.prototype.onMessage = function onMessage(ev) {
    if (validate(ev, this.id))
        this.emit.apply(this, ev.args);
};

// helpers

function validate(ev, id) {
    return (ev && ev.ns === NS && ev.id === id);
}


